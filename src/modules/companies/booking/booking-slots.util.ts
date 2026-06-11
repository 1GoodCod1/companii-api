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

export interface ComputeSlotsInput {
  settings: BookingSettings;
  /** First day to offer, YYYY-MM-DD in the company timezone. */
  fromDate: string;
  days: number;
  /** Start times of existing bookings/interventions inside the window. */
  busy: Date[];
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * Builds the public availability grid: working hours minus busy starts,
 * respecting lead time and booking horizon. Each busy item occupies the
 * slot containing its start (interventions carry no duration).
 */
export function computeAvailableSlots(input: ComputeSlotsInput): BookingDay[] {
  const { settings, fromDate, days, busy, now } = input;
  const slotMs = settings.slotMinutes * 60 * 1000;
  const earliest = now.getTime() + settings.leadTimeHours * 60 * 60 * 1000;
  const horizonEnd =
    zonedTimeToUtc(
      addDays(dateInZone(now, settings.timezone), settings.timezone, settings.horizonDays),
      '23:59',
      settings.timezone,
    ).getTime();

  const busyCount = new Map<number, number>();
  for (const b of busy) {
    const t = b.getTime();
    busyCount.set(t, (busyCount.get(t) ?? 0) + 1);
  }

  const result: BookingDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, settings.timezone, i);
    const weekday = weekdayOf(date, settings.timezone);
    const hours = settings.workingHours[weekday];
    const slots: BookingSlot[] = [];

    if (hours) {
      const dayStart = zonedTimeToUtc(date, hours[0], settings.timezone).getTime();
      const dayEnd = zonedTimeToUtc(date, hours[1], settings.timezone).getTime();
      for (let start = dayStart; start + slotMs <= dayEnd; start += slotMs) {
        if (start < earliest || start > horizonEnd) continue;
        let occupied = 0;
        for (const [busyStart, count] of busyCount) {
          if (busyStart >= start && busyStart < start + slotMs) occupied += count;
        }
        if (occupied >= settings.concurrent) continue;
        slots.push({ start: new Date(start).toISOString() });
      }
    }

    result.push({ date, weekday, slots });
  }
  return result;
}

/** True when `slotStart` is one of the bookable slots right now. */
export function isSlotAvailable(
  settings: BookingSettings,
  slotStart: Date,
  busy: Date[],
  now: Date,
): boolean {
  const date = dateInZone(slotStart, settings.timezone);
  const [day] = computeAvailableSlots({ settings, fromDate: date, days: 1, busy, now });
  const iso = slotStart.toISOString();
  return day.slots.some((slot) => slot.start === iso);
}
