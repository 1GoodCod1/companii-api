import {
  DEFAULT_BOOKING_SETTINGS,
  resolveBookingSettings,
  type BookingSettings,
} from './booking-settings.util';
import {
  computeAvailableSlots,
  isSlotAvailable,
  zonedTimeToUtc,
} from './booking-slots.util';
import type { BusySpan } from './booking-slots.util';

// 2026-06-15 is a Monday.
const settings: BookingSettings = {
  ...DEFAULT_BOOKING_SETTINGS,
  timezone: 'Europe/Chisinau',
  slotMinutes: 60,
  leadTimeHours: 2,
  horizonDays: 14,
  concurrent: 1,
  workingHours: {
    ...DEFAULT_BOOKING_SETTINGS.workingHours,
    mon: ['09:00', '12:00'],
  },
};

const monday = '2026-06-15';
const now = zonedTimeToUtc('2026-06-14', '08:00', settings.timezone);

function span(time: string, durationMinutes = 60): BusySpan {
  return { start: zonedTimeToUtc(monday, time, settings.timezone), durationMinutes };
}

function slotsOf(busy: BusySpan[] = [], at: Date = now, requestedDurationMinutes?: number) {
  const [day] = computeAvailableSlots({
    settings,
    fromDate: monday,
    days: 1,
    busy,
    now: at,
    requestedDurationMinutes,
  });
  return day.slots.map((slot) => slot.start);
}

describe('zonedTimeToUtc', () => {
  it('converts Chisinau summer time (UTC+3)', () => {
    expect(zonedTimeToUtc('2026-06-15', '09:00', 'Europe/Chisinau').toISOString()).toBe(
      '2026-06-15T06:00:00.000Z',
    );
  });

  it('converts Chisinau winter time (UTC+2)', () => {
    expect(zonedTimeToUtc('2026-01-15', '09:00', 'Europe/Chisinau').toISOString()).toBe(
      '2026-01-15T07:00:00.000Z',
    );
  });
});

describe('computeAvailableSlots', () => {
  it('generates hourly slots inside working hours', () => {
    expect(slotsOf()).toEqual([
      '2026-06-15T06:00:00.000Z',
      '2026-06-15T07:00:00.000Z',
      '2026-06-15T08:00:00.000Z',
    ]);
  });

  it('excludes slots taken by existing bookings', () => {
    expect(slotsOf([span('10:00')])).toEqual([
      '2026-06-15T06:00:00.000Z',
      '2026-06-15T08:00:00.000Z',
    ]);
  });

  it('keeps a slot when capacity allows parallel bookings', () => {
    const [day] = computeAvailableSlots({
      settings: { ...settings, concurrent: 2 },
      fromDate: monday,
      days: 1,
      busy: [span('10:00')],
      now,
    });
    expect(day.slots).toHaveLength(3);
  });

  it('a long job blocks every slot it spans', () => {
    // A 2h job at 10:00 occupies 10:00–12:00, so only the 09:00 slot stays free.
    expect(slotsOf([span('10:00', 120)])).toEqual(['2026-06-15T06:00:00.000Z']);
  });

  it('offers every working-hour start regardless of duration (long works may run past closing)', () => {
    // The duration only blocks overlapping works; it does not restrict which
    // start slots are offered, so a long/multi-day work can still be booked.
    expect(slotsOf([], now, 120)).toEqual([
      '2026-06-15T06:00:00.000Z',
      '2026-06-15T07:00:00.000Z',
      '2026-06-15T08:00:00.000Z',
    ]);
  });

  it('a multi-day job blocks every slot it covers', () => {
    // A 1-day job starting 09:00 covers the whole working day → no free slots.
    expect(slotsOf([span('09:00', 1440)])).toEqual([]);
  });

  it('treats the end of a busy span as free (no off-by-one overlap)', () => {
    // A 60-min job at 10:00 ends exactly at 11:00, leaving the 11:00 slot open.
    expect(slotsOf([span('10:00', 60)])).toContain('2026-06-15T08:00:00.000Z');
  });

  it('respects the lead time', () => {
    const lateNow = zonedTimeToUtc(monday, '08:30', settings.timezone);
    expect(slotsOf([], lateNow)).toEqual(['2026-06-15T08:00:00.000Z']);
  });

  it('returns no slots beyond the horizon', () => {
    const farPast = zonedTimeToUtc('2026-05-01', '08:00', settings.timezone);
    const [day] = computeAvailableSlots({
      settings,
      fromDate: monday,
      days: 1,
      busy: [],
      now: farPast,
    });
    expect(day.slots).toEqual([]);
  });

  it('returns empty slots on a day off', () => {
    const [sunday] = computeAvailableSlots({
      settings,
      fromDate: '2026-06-14',
      days: 1,
      busy: [],
      now: zonedTimeToUtc('2026-06-13', '08:00', settings.timezone),
    });
    expect(sunday.weekday).toBe('sun');
    expect(sunday.slots).toEqual([]);
  });
});

describe('isSlotAvailable', () => {
  it('accepts a listed slot and rejects off-grid or taken ones', () => {
    const slot = zonedTimeToUtc(monday, '10:00', settings.timezone);
    expect(isSlotAvailable(settings, slot, 60, [], now)).toBe(true);
    expect(isSlotAvailable(settings, slot, 60, [{ start: slot, durationMinutes: 60 }], now)).toBe(false);

    const offGrid = zonedTimeToUtc(monday, '10:30', settings.timezone);
    expect(isSlotAvailable(settings, offGrid, 60, [], now)).toBe(false);

    const outsideHours = zonedTimeToUtc(monday, '20:00', settings.timezone);
    expect(isSlotAvailable(settings, outsideHours, 60, [], now)).toBe(false);
  });
});

describe('resolveBookingSettings', () => {
  it('falls back to defaults for malformed input', () => {
    expect(resolveBookingSettings(null)).toEqual(DEFAULT_BOOKING_SETTINGS);
    expect(resolveBookingSettings('garbage')).toEqual(DEFAULT_BOOKING_SETTINGS);
    expect(resolveBookingSettings({ slotMinutes: 'NaN', workingHours: { mon: ['25:00', 'x'] } }))
      .toEqual(DEFAULT_BOOKING_SETTINGS);
  });

  it('applies valid overrides and clamps numbers', () => {
    const resolved = resolveBookingSettings({
      enabled: false,
      slotMinutes: 30,
      concurrent: 999,
      workingHours: { sun: ['10:00', '14:00'] },
    });
    expect(resolved.enabled).toBe(false);
    expect(resolved.slotMinutes).toBe(30);
    expect(resolved.concurrent).toBe(20);
    expect(resolved.workingHours.sun).toEqual(['10:00', '14:00']);
    expect(resolved.workingHours.mon).toEqual(['09:00', '18:00']);
  });
});
