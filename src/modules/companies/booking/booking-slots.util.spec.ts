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

function slotsOf(busy: Date[] = [], at: Date = now) {
  const [day] = computeAvailableSlots({
    settings,
    fromDate: monday,
    days: 1,
    busy,
    now: at,
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
    const busy = [zonedTimeToUtc(monday, '10:00', settings.timezone)];
    expect(slotsOf(busy)).toEqual([
      '2026-06-15T06:00:00.000Z',
      '2026-06-15T08:00:00.000Z',
    ]);
  });

  it('keeps a slot when capacity allows parallel bookings', () => {
    const busy = [zonedTimeToUtc(monday, '10:00', settings.timezone)];
    const [day] = computeAvailableSlots({
      settings: { ...settings, concurrent: 2 },
      fromDate: monday,
      days: 1,
      busy,
      now,
    });
    expect(day.slots).toHaveLength(3);
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
    expect(isSlotAvailable(settings, slot, [], now)).toBe(true);
    expect(isSlotAvailable(settings, slot, [slot], now)).toBe(false);

    const offGrid = zonedTimeToUtc(monday, '10:30', settings.timezone);
    expect(isSlotAvailable(settings, offGrid, [], now)).toBe(false);

    const outsideHours = zonedTimeToUtc(monday, '20:00', settings.timezone);
    expect(isSlotAvailable(settings, outsideHours, [], now)).toBe(false);
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
