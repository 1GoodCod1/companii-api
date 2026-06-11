export const BOOKING_WEEKDAYS = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

export type BookingWeekday = (typeof BOOKING_WEEKDAYS)[number];

/** ['09:00', '18:00'] working window, or null = day off. */
export type BookingDayHours = [string, string] | null;

export interface BookingSettings {
  enabled: boolean;
  timezone: string;
  slotMinutes: number;
  leadTimeHours: number;
  horizonDays: number;
  /** How many bookings can share one slot (e.g. number of crews). */
  concurrent: number;
  workingHours: Record<BookingWeekday, BookingDayHours>;
}

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  enabled: true,
  timezone: 'Europe/Chisinau',
  slotMinutes: 60,
  leadTimeHours: 2,
  horizonDays: 14,
  concurrent: 1,
  workingHours: {
    mon: ['09:00', '18:00'],
    tue: ['09:00', '18:00'],
    wed: ['09:00', '18:00'],
    thu: ['09:00', '18:00'],
    fri: ['09:00', '18:00'],
    sat: ['10:00', '15:00'],
    sun: null,
  },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? Math.trunc(value) : NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function parseDayHours(raw: unknown, fallback: BookingDayHours): BookingDayHours {
  if (raw === null) return null;
  if (
    Array.isArray(raw) &&
    raw.length === 2 &&
    typeof raw[0] === 'string' &&
    typeof raw[1] === 'string' &&
    TIME_RE.test(raw[0]) &&
    TIME_RE.test(raw[1]) &&
    raw[0] < raw[1]
  ) {
    return [raw[0], raw[1]];
  }
  return fallback;
}

/**
 * Company.bookingSettings is free-form JSON edited by tenants; never trust it.
 * Anything malformed silently falls back to defaults so a broken value can
 * never take public booking down.
 */
export function resolveBookingSettings(raw: unknown): BookingSettings {
  const defaults = DEFAULT_BOOKING_SETTINGS;
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }
  const obj = raw as Record<string, unknown>;
  const rawHours =
    typeof obj.workingHours === 'object' && obj.workingHours !== null && !Array.isArray(obj.workingHours)
      ? (obj.workingHours as Record<string, unknown>)
      : {};

  const workingHours = {} as Record<BookingWeekday, BookingDayHours>;
  for (const day of BOOKING_WEEKDAYS) {
    workingHours[day] =
      day in rawHours
        ? parseDayHours(rawHours[day], defaults.workingHours[day])
        : defaults.workingHours[day];
  }

  return {
    enabled: obj.enabled === undefined ? defaults.enabled : obj.enabled === true,
    timezone: typeof obj.timezone === 'string' && obj.timezone ? obj.timezone : defaults.timezone,
    slotMinutes: clampInt(obj.slotMinutes, 15, 240, defaults.slotMinutes),
    leadTimeHours: clampInt(obj.leadTimeHours, 0, 72, defaults.leadTimeHours),
    horizonDays: clampInt(obj.horizonDays, 1, 60, defaults.horizonDays),
    concurrent: clampInt(obj.concurrent, 1, 20, defaults.concurrent),
    workingHours,
  };
}
