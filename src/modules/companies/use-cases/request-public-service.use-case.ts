import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../../common/rls/rls-system.util';
import { resolveClientContactFromUser } from '../../../common/utils/client-contact.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { ClientServiceRequestDto } from '@/modules/companies/dto/client-service-request.dto';
import { createPublicCompanyLead } from '../utils/public-lead.util';
import { LeadNotificationService } from '../services/lead-notification.service';
import { BookingAvailabilityService } from '../booking/booking-availability.service';
import { resolveBookingSettings } from '../booking/booking-settings.util';
import { assertNotSpam } from '../utils/spam-guard.util';

@Injectable()
export class RequestPublicServiceUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadNotifier: LeadNotificationService,
    private readonly availability: BookingAvailabilityService,
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

      const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : undefined;
      if (scheduledAt) {
        await this.assertSlotBookable(tx, company.id, company.bookingSettings, scheduledAt);
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
          categoryId: service.categoryId ?? undefined,
          serviceTitle: service.name,
          estimatedBudget: Number(service.defaultPrice) > 0 ? Number(service.defaultPrice) : undefined,
          source,
        },
        { portalUserId: contact.portalUserId },
      );

      return {
        response: {
          leadId: result.lead.id,
          customerId: result.customerId,
          customerCreated: result.customerCreated,
          scheduledAt: result.lead.scheduledAt,
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

  private async assertSlotBookable(
    tx: Prisma.TransactionClient,
    companyId: string,
    rawSettings: unknown,
    slotStart: Date,
  ): Promise<void> {
    if (Number.isNaN(slotStart.getTime())) {
      throw AppErrors.badRequest(AppErrorMessages.BOOKING_SLOT_UNAVAILABLE);
    }
    const settings = resolveBookingSettings(rawSettings);
    if (!settings.enabled) {
      throw AppErrors.badRequest(AppErrorMessages.BOOKING_DISABLED);
    }

    const slotIso = slotStart.toISOString();
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), hashtext(${slotIso}))`;

    const free = await this.availability.slotIsFree(tx, companyId, settings, slotStart);
    if (!free) {
      throw AppErrors.conflict(AppErrorMessages.BOOKING_SLOT_UNAVAILABLE);
    }
  }
}
