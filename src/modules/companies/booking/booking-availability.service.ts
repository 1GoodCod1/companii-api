import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import type { BookingSettings } from './booking-settings.util';
import { computeAvailableSlots, isSlotAvailable, zonedTimeToUtc, type BookingDay } from './booking-slots.util';

/**
 * Lead statuses that still hold their requested time slot. CONVERTED is
 * excluded because the converted lead's intervention occupies the slot.
 */
const SLOT_HOLDING_LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'IN_PROGRESS'] as const;

@Injectable()
export class BookingAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Collects busy slot starts for a company inside [from, to]. Must run under
   * a privileged RLS context: interventions and leads are tenant-scoped and
   * deliberately unreadable by anonymous/portal sessions — only the aggregated
   * availability ever leaves the API.
   */
  async findBusyStarts(
    tx: Prisma.TransactionClient,
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<Date[]> {
    const [interventions, leads] = await this.prisma.inSerial([
      () =>
        tx.intervention.findMany({
          where: {
            companyId,
            scheduledAt: { gte: from, lte: to },
            status: { not: 'CANCELLED' },
          },
          select: { scheduledAt: true },
        }),
      () =>
        tx.companyLead.findMany({
          where: {
            companyId,
            scheduledAt: { gte: from, lte: to },
            status: { in: [...SLOT_HOLDING_LEAD_STATUSES] },
          },
          select: { scheduledAt: true },
        }),
    ]);

    return [...interventions, ...leads]
      .map((item) => item.scheduledAt)
      .filter((value): value is Date => value !== null);
  }

  async availableDays(
    tx: Prisma.TransactionClient,
    companyId: string,
    settings: BookingSettings,
    fromDate: string,
    days: number,
    now = new Date(),
  ): Promise<BookingDay[]> {
    const windowStart = zonedTimeToUtc(fromDate, '00:00', settings.timezone);
    const windowEnd = new Date(
      windowStart.getTime() + days * 24 * 60 * 60 * 1000,
    );
    const busy = await this.findBusyStarts(tx, companyId, windowStart, windowEnd);
    return computeAvailableSlots({ settings, fromDate, days, busy, now });
  }

  async slotIsFree(
    tx: Prisma.TransactionClient,
    companyId: string,
    settings: BookingSettings,
    slotStart: Date,
    now = new Date(),
  ): Promise<boolean> {
    const slotMs = settings.slotMinutes * 60 * 1000;
    const busy = await this.findBusyStarts(
      tx,
      companyId,
      new Date(slotStart.getTime() - slotMs),
      new Date(slotStart.getTime() + slotMs),
    );
    return isSlotAvailable(settings, slotStart, busy, now);
  }
}
