import { toCursorPage } from './cursor-page.util';

describe('toCursorPage', () => {
  const row = (id: string) => ({ id });

  it('wraps items into a uniform envelope', () => {
    const page = toCursorPage([row('a'), row('b')], 25);
    expect(page.items).toHaveLength(2);
  });

  it('returns null cursor for the first (cursor-less) short page', () => {
    expect(toCursorPage([row('a')], 25).nextCursor).toBeNull();
  });

  it('exposes the last id as nextCursor when a full page was returned', () => {
    const items = Array.from({ length: 25 }, (_, i) => row(`id-${i}`));
    expect(toCursorPage(items, 25).nextCursor).toBe('id-24');
  });

  it('returns null cursor for an empty result', () => {
    const page = toCursorPage([], 25);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('does not advance the cursor when fewer than `take` rows came back', () => {
    const items = Array.from({ length: 10 }, (_, i) => row(`id-${i}`));
    expect(toCursorPage(items, 25).nextCursor).toBeNull();
  });
});
