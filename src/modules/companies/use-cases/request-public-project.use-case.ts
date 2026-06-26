import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../../common/rls/rls-system.util';
import { resolveClientContactFromUser } from '../../../common/utils/client-contact.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { ClientProjectRequestDto } from '@/modules/companies/dto/client-project-request.dto';
import { createPublicCompanyLead } from '../utils/public-lead.util';
import { LeadNotificationService } from '../services/lead-notification.service';
import { BookingAvailabilityService } from '../booking/booking-availability.service';
import { resolveBookingSettings } from '../booking/booking-settings.util';
import { clampDurationMinutes } from '../booking/booking-slots.util';
import { assertNotSpam } from '../utils/spam-guard.util';

@Injectable()
export class RequestPublicProjectUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadNotifier: LeadNotificationService,
    private readonly availability: BookingAvailabilityService,
  ) {}

  async execute(user: JwtPayload, companySlug: string, body: ClientProjectRequestDto) {
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
        select: { id: true, categoryId: true, bookingSettings: true },
      });
      if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);

      const categoryId = body.categoryId ?? company.categoryId ?? undefined;
      if (categoryId) {
        const category = await tx.category.findUnique({ where: { id: categoryId } });
        if (!category) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
      }

      // Optional proposed date: reserve the slot on the project request itself.
      // A complex project still goes through estimation, so we do NOT auto-create
      // a scheduled work — the date just holds the slot (race-safe).
      const settings = resolveBookingSettings(company.bookingSettings);
      const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : undefined;
      const durationMinutes = scheduledAt
        ? clampDurationMinutes(body.durationMinutes, settings.slotMinutes)
        : undefined;
      if (scheduledAt) {
        if (Number.isNaN(scheduledAt.getTime())) {
          throw AppErrors.badRequest(AppErrorMessages.BOOKING_SLOT_UNAVAILABLE);
        }
        if (!settings.enabled) {
          throw AppErrors.badRequest(AppErrorMessages.BOOKING_DISABLED);
        }
        await this.availability.lockCompany(tx, company.id);
        const free = await this.availability.slotIsFree(
          tx,
          company.id,
          settings,
          scheduledAt,
          durationMinutes!,
        );
        if (!free) throw AppErrors.conflict(AppErrorMessages.BOOKING_SLOT_UNAVAILABLE);
      }

      const result = await createPublicCompanyLead(
        tx,
        {
          companyId: company.id,
          contactName: contact.contactName,
          contactPhone: contact.contactPhone,
          contactEmail: contact.contactEmail,
          message: body.message.trim(),
          address: body.address,
          scheduledAt,
          durationMinutes,
          categoryId,
          serviceTitle: body.projectTitle?.trim() || 'Cerere proiect',
          estimatedBudget: body.estimatedBudget,
          source: 'PROJECT_REQUEST',
        },
        { portalUserId: contact.portalUserId },
      );

      return {
        response: {
          leadId: result.lead.id,
          customerId: result.customerId,
          customerCreated: result.customerCreated,
        },
        notification: {
          companyId: company.id,
          lead: {
            source: 'PROJECT_REQUEST' as const,
            contactName: result.lead.contactName,
            contactPhone: result.lead.contactPhone,
            contactEmail: result.lead.contactEmail,
            serviceTitle: result.lead.serviceTitle,
            message: result.lead.message,
            address: result.lead.address,
            estimatedBudget: result.lead.estimatedBudget
              ? Number(result.lead.estimatedBudget)
              : null,
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
}
