import { ConflictException } from '@nestjs/common';
import { assertVersionMatch, ESTIMATE_VERSION_CONFLICT } from './conflict-resolution.util';

describe('assertVersionMatch (M-05)', () => {
  const meta = { number: 'EST-00001', title: 'Renovare baie' };

  it('passes when expected is undefined (legacy clients)', () => {
    expect(() => assertVersionMatch(5, undefined, meta)).not.toThrow();
  });

  it('passes when versions match', () => {
    expect(() => assertVersionMatch(5, 5, meta)).not.toThrow();
  });

  it('throws ConflictException with structured payload when versions diverge', () => {
    try {
      assertVersionMatch(7, 5, meta);
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe(ESTIMATE_VERSION_CONFLICT);
      expect(body.expectedVersion).toBe(5);
      expect(body.serverVersion).toBe(7);
      expect(body.number).toBe('EST-00001');
      expect(body.title).toBe('Renovare baie');
    }
  });
});
