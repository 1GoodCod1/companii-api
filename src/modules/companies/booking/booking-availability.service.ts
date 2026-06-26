import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { resolveBookingSettings, type BookingSettings } from './booking-settings.util';
import {
  clampDurationMinutes,
  computeAvailableSlots,
  hasCapacity,
  isSlotAvailable,
  zonedTimeToUtc,
  MAX_BOOKING_DURATION_MINUTES,
  type BookingDay,
  type BusySpan,
} from './booking-slots.util';

const SLOT_HOLDING_LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'IN_PROGRESS'] as const;
const LOOKBACK_MS = MAX_BOOKING_DURATION_MINUTES * 60 * 1000;

@Injectable()
export class BookingAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}
  async lockCompany(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`;
  }
  async findBusy(
    tx: Prisma.TransactionClient,
    companyId: string,
    from: Date,
    to: Date,
    fallbackDurationMinutes: number,
    excludeInterventionId?: string,
  ): Promise<BusySpan[]> {
    const [interventions, leads] = await this.prisma.inSerial([
      () =>
        tx.intervention.findMany({
          where: {
            companyId,
            scheduledAt: { gte: from, lte: to },
            status: { not: 'CANCELLED' },
            ...(excludeInterventionId ? { id: { not: excludeInterventionId } } : {}),
          },
          select: { scheduledAt: true, durationMinutes: true },
        }),
      () =>
        tx.companyLead.findMany({
          where: {
            companyId,
            scheduledAt: { gte: from, lte: to },
            status: { in: [...SLOT_HOLDING_LEAD_STATUSES] },
          },
          select: { scheduledAt: true, durationMinutes: true },
        }),
    ]);

    const rows: { scheduledAt: Date | null; durationMinutes: number | null }[] = [
      ...interventions,
      ...leads,
    ];
    return rows.flatMap((item) =>
      item.scheduledAt
        ? [{ start: item.scheduledAt, durationMinutes: item.durationMinutes ?? fallbackDurationMinutes }]
        : [],
    );
  }

  async availableDays(
    tx: Prisma.TransactionClient,
    companyId: string,
    settings: BookingSettings,
    fromDate: string,
    days: number,
    requestedDurationMinutes: number,
    now = new Date(),
  ): Promise<BookingDay[]> {
    const windowStart = zonedTimeToUtc(fromDate, '00:00', settings.timezone);
    const windowEnd = new Date(windowStart.getTime() + days * 24 * 60 * 60 * 1000);
    const busy = await this.findBusy(
      tx,
      companyId,
      new Date(windowStart.getTime() - LOOKBACK_MS),
      windowEnd,
      settings.slotMinutes,
    );
    return computeAvailableSlots({ settings, fromDate, days, busy, now, requestedDurationMinutes });
  }

  async slotIsFree(
    tx: Prisma.TransactionClient,
    companyId: string,
    settings: BookingSettings,
    slotStart: Date,
    durationMinutes: number,
    now = new Date(),
  ): Promise<boolean> {
    const busy = await this.findBusy(
      tx,
      companyId,
      new Date(slotStart.getTime() - LOOKBACK_MS),
      new Date(slotStart.getTime() + durationMinutes * 60 * 1000),
      settings.slotMinutes,
    );
    return isSlotAvailable(settings, slotStart, durationMinutes, busy, now);
  }
  async assertCompanySlotFree(
    tx: Prisma.TransactionClient,
    companyId: string,
    start: Date,
    durationMinutes: number | null | undefined,
    excludeInterventionId?: string,
  ): Promise<void> {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { bookingSettings: true },
    });
    const settings = resolveBookingSettings(company?.bookingSettings);
    const duration = clampDurationMinutes(durationMinutes ?? settings.slotMinutes, settings.slotMinutes);
    const startMs = start.getTime();
    const endMs = startMs + duration * 60 * 1000;
    const busy = await this.findBusy(
      tx,
      companyId,
      new Date(startMs - LOOKBACK_MS),
      new Date(endMs),
      settings.slotMinutes,
      excludeInterventionId,
    );
    if (!hasCapacity(busy, startMs, endMs, settings.concurrent)) {
      throw AppErrors.conflict(AppErrorMessages.BOOKING_SLOT_CONFLICT);
    }
  }
}
