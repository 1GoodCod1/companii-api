import type { BookingSettings, BookingWeekday } from './booking-settings.util';
import { BOOKING_WEEKDAYS } from './booking-settings.util';

export interface BookingSlot {
  /** Slot start, ISO UTC. */
  start: string;
}

export interface BookingDay {
  /** Calendar date in the company timezone, YYYY-MM-DD. */
  date: string;
  weekday: BookingWeekday;
  slots: BookingSlot[];
}

/** An occupied time range: a booking/intervention with its duration. */
export interface BusySpan {
  start: Date;
  durationMinutes: number;
}

export interface ComputeSlotsInput {
  settings: BookingSettings;
  /** First day to offer, YYYY-MM-DD in the company timezone. */
  fromDate: string;
  days: number;
  /** Existing bookings/interventions (start + duration) inside the window. */
  busy: BusySpan[];
  now: Date;
  /** Duration of the work being booked; defaults to settings.slotMinutes. */
  requestedDurationMinutes?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hard ceiling for a single bookable work (30 days) — large works can span
 * hours or several days. Also bounds the busy-lookback window.
 */
export const MAX_BOOKING_DURATION_MINUTES = 30 * 24 * 60;

/** Normalize a requested duration to a sane, bounded value (or the fallback). */
export function clampDurationMinutes(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? Math.round(value) : NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(MAX_BOOKING_DURATION_MINUTES, Math.max(15, num));
}

/**
 * True when a work of `[startMs, endMs)` fits without exceeding `concurrent`
 * capacity — i.e. at no instant inside it do existing busy spans already fill
 * all parallel slots. Coverage only rises at a span's start, so checking the
 * candidate start plus each busy start inside the range is exact.
 */
export function hasCapacity(
  busy: BusySpan[],
  startMs: number,
  endMs: number,
  concurrent: number,
): boolean {
  const spans = busy
    .map((b) => ({ start: b.start.getTime(), end: b.start.getTime() + b.durationMinutes * 60_000 }))
    .filter((s) => s.start < endMs && s.end > startMs);
  if (spans.length === 0) return true;

  const points = [startMs, ...spans.map((s) => s.start).filter((p) => p > startMs && p < endMs)];
  for (const p of points) {
    let coverage = 0;
    for (const s of spans) if (s.start <= p && s.end > p) coverage += 1;
    if (coverage >= concurrent) return false;
  }
  return true;
}

function tzOffsetMs(timeZone: string, utcDate: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const { type, value } of dtf.formatToParts(utcDate)) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - utcDate.getTime();
}

/** Convert wall-clock date+time in a timezone to a UTC instant. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  // Two passes handle DST: the first guess may land on the wrong offset side.
  let offset = tzOffsetMs(timeZone, new Date(naiveUtc));
  offset = tzOffsetMs(timeZone, new Date(naiveUtc - offset));
  return new Date(naiveUtc - offset);
}

/** Calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function dateInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function weekdayOf(date: string, timeZone: string): BookingWeekday {
  const probe = zonedTimeToUtc(date, '12:00', timeZone);
  const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    .format(probe)
    .toLowerCase()
    .slice(0, 3);
  return BOOKING_WEEKDAYS.includes(label as BookingWeekday)
    ? (label as BookingWeekday)
    : 'mon';
}

function addDays(date: string, timeZone: string, days: number): string {
  const noon = zonedTimeToUtc(date, '12:00', timeZone);
  return dateInZone(new Date(noon.getTime() + days * DAY_MS), timeZone);
}

/**
 * Builds the public availability grid: working hours minus busy time, respecting
 * lead time and booking horizon. A candidate start is offered only if the whole
 * requested work `[start, start+duration)` fits inside the working window and
 * never exceeds `concurrent` capacity against existing busy spans.
 */
export function computeAvailableSlots(input: ComputeSlotsInput): BookingDay[] {
  const { settings, fromDate, days, busy, now } = input;
  const slotMs = settings.slotMinutes * 60 * 1000;
  const durationMs =
    Math.max(settings.slotMinutes, input.requestedDurationMinutes ?? settings.slotMinutes) * 60 * 1000;
  const earliest = now.getTime() + settings.leadTimeHours * 60 * 60 * 1000;
  const horizonEnd =
    zonedTimeToUtc(
      addDays(dateInZone(now, settings.timezone), settings.timezone, settings.horizonDays),
      '23:59',
      settings.timezone,
    ).getTime();

  const result: BookingDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, settings.timezone, i);
    const weekday = weekdayOf(date, settings.timezone);
    const hours = settings.workingHours[weekday];
    const slots: BookingSlot[] = [];

    if (hours) {
      const dayStart = zonedTimeToUtc(date, hours[0], settings.timezone).getTime();
      const dayEnd = zonedTimeToUtc(date, hours[1], settings.timezone).getTime();
      // Only the START must fall inside the working window — a long/multi-day
      // work may run past closing. The duration is still used to block any
      // overlapping work via the capacity check.
      for (let start = dayStart; start + slotMs <= dayEnd; start += slotMs) {
        if (start < earliest || start > horizonEnd) continue;
        if (!hasCapacity(busy, start, start + durationMs, settings.concurrent)) continue;
        slots.push({ start: new Date(start).toISOString() });
      }
    }

    result.push({ date, weekday, slots });
  }
  return result;
}

/** True when a work of `durationMinutes` can start at `slotStart` right now. */
export function isSlotAvailable(
  settings: BookingSettings,
  slotStart: Date,
  durationMinutes: number,
  busy: BusySpan[],
  now: Date,
): boolean {
  const date = dateInZone(slotStart, settings.timezone);
  const [day] = computeAvailableSlots({
    settings,
    fromDate: date,
    days: 1,
    busy,
    now,
    requestedDurationMinutes: durationMinutes,
  });
  const iso = slotStart.toISOString();
  return day.slots.some((slot) => slot.start === iso);
}
