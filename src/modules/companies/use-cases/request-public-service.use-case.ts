import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../../common/rls/rls-system.util';
import { resolveClientContactFromUser } from '../../../common/utils/client-contact.util';
import { nextCompanyNumber } from '../../../common/utils/sequence-number.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { ClientServiceRequestDto } from '@/modules/companies/dto/client-service-request.dto';
import { createPublicCompanyLead } from '../utils/public-lead.util';
import { LeadNotificationService } from '../services/lead-notification.service';
import { CompanyAuthorizationService } from '../authorization/company-authorization.service';
import { BookingAvailabilityService } from '../booking/booking-availability.service';
import { resolveBookingSettings, type BookingSettings } from '../booking/booking-settings.util';
import { clampDurationMinutes } from '../booking/booking-slots.util';
import { assertNotSpam } from '../utils/spam-guard.util';

@Injectable()
export class RequestPublicServiceUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadNotifier: LeadNotificationService,
    private readonly availability: BookingAvailabilityService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async execute(
    user: JwtPayload,
    companySlug: string,
    serviceId: string,
    body: ClientServiceRequestDto,
  ) {
    const contact = await resolveClientContactFromUser(
      this.prisma,
      user.sub,
      user.accountKind,
    );

    assertNotSpam(body.message, contact.contactPhone);

    return this.prisma.runOutsideRlsContext(() =>
      this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (tx) => {
      const company = await tx.company.findFirst({
        where: { slug: companySlug, isPublished: true, isVerified: true },
        select: { id: true, slug: true, bookingSettings: true },
      });
      if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);

      const service = await tx.companyService.findFirst({
        where: { id: serviceId, companyId: company.id, isPublished: true },
        include: { category: true },
      });
      if (!service) throw AppErrors.notFound(AppErrorMessages.SERVICE_NOT_FOUND);

      const settings = resolveBookingSettings(company.bookingSettings);
      const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : undefined;
      const durationMinutes = scheduledAt
        ? clampDurationMinutes(body.durationMinutes, service.durationMinutes ?? settings.slotMinutes)
        : undefined;

      if (scheduledAt) {
        // Serialize this company's bookings, then re-check under the lock.
        await this.availability.lockCompany(tx, company.id);
        await this.assertSlotBookable(tx, company.id, settings, scheduledAt, durationMinutes!);
      }
      const source = scheduledAt ? ('BOOKING' as const) : ('SERVICE_REQUEST' as const);

      const result = await createPublicCompanyLead(
        tx,
        {
          companyId: company.id,
          contactName: contact.contactName,
          contactPhone: contact.contactPhone,
          contactEmail: contact.contactEmail,
          message: body.message?.trim() || `Cerere serviciu: ${service.name}`,
          scheduledAt,
          durationMinutes,
          categoryId: service.categoryId ?? undefined,
          serviceTitle: service.name,
          estimatedBudget: Number(service.defaultPrice) > 0 ? Number(service.defaultPrice) : undefined,
          source,
        },
        { portalUserId: contact.portalUserId },
      );

      // Auto-confirm: turn the booking straight into a SCHEDULED work, unless the
      // company turned it off or has hit its monthly intervention limit (then the
      // booking stays a NEW lead holding the slot for manual handling).
      let interventionId: string | null = null;
      if (scheduledAt && settings.autoConfirm && (await this.canCreateIntervention(company.id))) {
        interventionId = await this.scheduleInterventionFromLead(tx, {
          companyId: company.id,
          customerId: result.customerId,
          lead: result.lead,
          estimatedPrice: Number(service.defaultPrice) > 0 ? service.defaultPrice : null,
          scheduledAt,
          durationMinutes: durationMinutes!,
        });
      }

      return {
        response: {
          leadId: result.lead.id,
          customerId: result.customerId,
          customerCreated: result.customerCreated,
          scheduledAt: result.lead.scheduledAt,
          durationMinutes: durationMinutes ?? null,
          scheduled: interventionId !== null,
          interventionId,
          service: { id: service.id, name: service.name },
        },
        notification: {
          companyId: company.id,
          lead: {
            source,
            contactName: result.lead.contactName,
            contactPhone: result.lead.contactPhone,
            contactEmail: result.lead.contactEmail,
            serviceTitle: result.lead.serviceTitle,
            message: result.lead.message,
            address: result.lead.address,
            estimatedBudget: result.lead.estimatedBudget
              ? Number(result.lead.estimatedBudget)
              : undefined,
            customerCreated: result.customerCreated,
          },
        },
      };
    })).then(({ response, notification }) => {
      this.prisma.deferOutsideRlsContext(() =>
        this.leadNotifier.safeNotifyManagersAboutPublicLead(
          notification.companyId,
          notification.lead,
        ),
      );
      return response;
    });
  }

  private async canCreateIntervention(companyId: string): Promise<boolean> {
    try {
      await this.companyAuth.assertInterventionMonthlyLimit(companyId);
      return true;
    } catch {
      return false;
    }
  }

  private async assertSlotBookable(
    tx: Prisma.TransactionClient,
    companyId: string,
    settings: BookingSettings,
    slotStart: Date,
    durationMinutes: number,
  ): Promise<void> {
    if (Number.isNaN(slotStart.getTime())) {
      throw AppErrors.badRequest(AppErrorMessages.BOOKING_SLOT_UNAVAILABLE);
    }
    if (!settings.enabled) {
      throw AppErrors.badRequest(AppErrorMessages.BOOKING_DISABLED);
    }

    const free = await this.availability.slotIsFree(tx, companyId, settings, slotStart, durationMinutes);
    if (!free) {
      throw AppErrors.conflict(AppErrorMessages.BOOKING_SLOT_UNAVAILABLE);
    }
  }

  private async scheduleInterventionFromLead(
    tx: Prisma.TransactionClient,
    input: {
      companyId: string;
      customerId: string;
      lead: {
        id: string;
        serviceTitle: string | null;
        message: string | null;
        address: string | null;
        category?: { name: string } | null;
      };
      estimatedPrice: Prisma.Decimal | null;
      scheduledAt: Date;
      durationMinutes: number;
    },
  ): Promise<string> {
    const number = await nextCompanyNumber(tx, {
      companyId: input.companyId,
      namespace: 'intervention-number',
      prefix: 'INT',
      count: (year) =>
        tx.intervention.count({
          where: {
            companyId: input.companyId,
            createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
          },
        }),
      exists: async (n) =>
        this.prisma.runOutsideRlsContext(() =>
          this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) => {
            const intv = await db.intervention.findUnique({ where: { number: n }, select: { id: true } });
            return intv !== null;
          }),
        ),
    });

    const intervention = await tx.intervention.create({
      data: {
        companyId: input.companyId,
        customerId: input.customerId,
        sourceLeadId: input.lead.id,
        number,
        type: input.lead.serviceTitle ?? input.lead.category?.name ?? 'Programare online',
        description: input.lead.message ?? input.lead.serviceTitle ?? 'Programare online',
        address: input.lead.address ?? '',
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        status: 'SCHEDULED',
        estimatedPrice: input.estimatedPrice ?? undefined,
      },
    });

    // No status-history row: a client booking has no acting company member, and
    // changedByMemberId is required. The SCHEDULED status itself is the record.

    await tx.companyLead.update({
      where: { id: input.lead.id },
      data: { customerId: input.customerId, status: 'CONVERTED', convertedAt: new Date() },
    });

    return intervention.id;
  }
}
