import {
  bucketKey,
  bucketStartFor,
  buildBuckets,
  granularityFor,
  windowStartFor,
} from './analytics-buckets.util';

describe('analytics-buckets.util', () => {
  // Friday, 2026-06-05 14:30 UTC.
  const now = new Date('2026-06-05T14:30:00.000Z');

  describe('12m', () => {
    it('produces 12 dense monthly buckets ending in the current month', () => {
      const buckets = buildBuckets('12m', now);
      expect(granularityFor('12m')).toBe('month');
      expect(buckets).toHaveLength(12);
      expect(bucketKey(buckets[0])).toBe('2025-07-01');
      expect(bucketKey(buckets[11])).toBe('2026-06-01');
      expect(bucketKey(windowStartFor('12m', now))).toBe('2025-07-01');
    });
  });

  describe('30d', () => {
    it('produces 30 dense daily buckets ending today', () => {
      const buckets = buildBuckets('30d', now);
      expect(granularityFor('30d')).toBe('day');
      expect(buckets).toHaveLength(30);
      expect(bucketKey(buckets[0])).toBe('2026-05-07');
      expect(bucketKey(buckets[29])).toBe('2026-06-05');
    });
  });

  describe('90d', () => {
    it('produces Monday-aligned weekly buckets', () => {
      const buckets = buildBuckets('90d', now);
      expect(granularityFor('90d')).toBe('week');
      expect(buckets.length).toBeGreaterThanOrEqual(13);
      for (const bucket of buckets) {
        expect(bucket.getUTCDay()).toBe(1); // Monday
      }
      expect(bucketKey(buckets[buckets.length - 1])).toBe('2026-06-01');
    });
  });

  describe('bucketStartFor', () => {
    it('truncates a date to the first of its month (UTC)', () => {
      expect(bucketKey(bucketStartFor(new Date('2026-03-17T10:00:00Z'), 'month'))).toBe(
        '2026-03-01',
      );
    });

    it('aligns a date to the start of its ISO week (Monday, UTC)', () => {
      // 2026-06-05 is a Friday → its Monday is 2026-06-01.
      expect(bucketKey(bucketStartFor(new Date('2026-06-05T00:00:00Z'), 'week'))).toBe(
        '2026-06-01',
      );
    });
  });
});
