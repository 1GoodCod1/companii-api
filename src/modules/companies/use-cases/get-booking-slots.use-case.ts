import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../../common/rls/rls-system.util';
import { PrismaService } from '../../shared/database/prisma.service';
import { BookingAvailabilityService } from '../booking/booking-availability.service';
import { resolveBookingSettings } from '../booking/booking-settings.util';
import { dateInZone } from '../booking/booking-slots.util';

const MAX_DAYS_PER_REQUEST = 7;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class GetBookingSlotsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: BookingAvailabilityService,
  ) {}

  /**
   * Public availability for a company page. Runs under the system RLS
   * context: the busy data (interventions, leads) is tenant-scoped, and only
   * the aggregated free slots are returned to the caller.
   */
  async execute(companySlug: string, fromQuery?: string) {
    return this.prisma.runOutsideRlsContext(() =>
      this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (tx) => {
        const company = await tx.company.findFirst({
          where: { slug: companySlug, isPublished: true, isVerified: true },
          select: { id: true, bookingSettings: true },
        });
        if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);

        const settings = resolveBookingSettings(company.bookingSettings);
        if (!settings.enabled) {
          return { enabled: false as const, timezone: settings.timezone, slotMinutes: settings.slotMinutes, days: [] };
        }

        const now = new Date();
        const today = dateInZone(now, settings.timezone);
        const fromDate = fromQuery && DATE_RE.test(fromQuery) && fromQuery >= today ? fromQuery : today;

        const days = await this.availability.availableDays(
          tx,
          company.id,
          settings,
          fromDate,
          MAX_DAYS_PER_REQUEST,
          now,
        );

        return {
          enabled: true as const,
          timezone: settings.timezone,
          slotMinutes: settings.slotMinutes,
          days,
        };
      }),
    );
  }
}
