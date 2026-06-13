export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export function toCursorPage<T extends { id: string }>(
  items: T[],
  take: number,
): CursorPage<T> {
  return {
    items,
    nextCursor: items.length === take ? items[items.length - 1]?.id ?? null : null,
  };
}
