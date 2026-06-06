import type { AnalyticsPeriod } from './analytics.types';

export type BucketGranularity = 'day' | 'week' | 'month';

interface PeriodConfig {
  granularity: BucketGranularity;
  /** First bucket boundary (inclusive) for the window ending at `now`. */
  windowStart(now: Date): Date;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday-aligned start of the ISO week (UTC). */
function startOfUtcWeek(d: Date): Date {
  const day = startOfUtcDay(d);
  const isoDow = (day.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  day.setUTCDate(day.getUTCDate() - isoDow);
  return day;
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(d: Date, months: number): Date {
  const next = new Date(d);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

const PERIOD_CONFIG: Record<AnalyticsPeriod, PeriodConfig> = {
  '30d': {
    granularity: 'day',
    windowStart: (now) => addDays(startOfUtcDay(now), -29), // 30 daily buckets
  },
  '90d': {
    granularity: 'week',
    windowStart: (now) => startOfUtcWeek(addDays(startOfUtcDay(now), -7 * 12)), // 13 weekly buckets
  },
  '12m': {
    granularity: 'month',
    windowStart: (now) => startOfUtcMonth(addMonths(now, -11)), // 12 monthly buckets
  },
};

export function granularityFor(period: AnalyticsPeriod): BucketGranularity {
  return PERIOD_CONFIG[period].granularity;
}

/** Inclusive lower bound for the DB query (= the first bucket's boundary). */
export function windowStartFor(period: AnalyticsPeriod, now: Date): Date {
  return PERIOD_CONFIG[period].windowStart(now);
}

/** The bucket boundary a given date falls into, for the period's granularity. */
export function bucketStartFor(date: Date, granularity: BucketGranularity): Date {
  if (granularity === 'day') return startOfUtcDay(date);
  if (granularity === 'week') return startOfUtcWeek(date);
  return startOfUtcMonth(date);
}

function advance(d: Date, granularity: BucketGranularity): Date {
  if (granularity === 'day') return addDays(d, 1);
  if (granularity === 'week') return addDays(d, 7);
  return addMonths(d, 1);
}

export function buildBuckets(period: AnalyticsPeriod, now: Date): Date[] {
  const granularity = granularityFor(period);
  const start = windowStartFor(period, now);
  const end = bucketStartFor(now, granularity);
  const buckets: Date[] = [];
  for (let cur = start; cur.getTime() <= end.getTime(); cur = advance(cur, granularity)) {
    buckets.push(cur);
  }
  return buckets;
}

export function bucketKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
