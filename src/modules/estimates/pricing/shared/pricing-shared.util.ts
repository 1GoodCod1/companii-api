export const CUSTOM_PRICING_KEYS = {
  unitPriceSqm: 'customUnitPriceSqm',
  durationDays: 'customDurationDays',
  laborHours: 'customLaborHours',
  laborTotal: 'customLaborTotal',
} as const;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeRateKey(value: string): string {
  return value.trim().toLowerCase();
}

export function readOptionalPositiveNumber(
  diagnostic: Record<string, unknown> | null | undefined,
  key: string,
): number | undefined {
  const value = diagnostic?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

export function distributeDurationDays(
  totalDays: number,
  stages: Array<{ id: string; durationDays: number | null }>,
): Array<{ id: string; durationDays: number }> {
  if (!stages.length) return [];

  const weights = stages.map((stage) => Math.max(1, stage.durationDays ?? 1));
  const weightSum = weights.reduce((acc, value) => acc + value, 0);
  let assigned = 0;

  return stages.map((stage, index) => {
    if (index === stages.length - 1) {
      return { id: stage.id, durationDays: Math.max(1, totalDays - assigned) };
    }

    const days = Math.max(1, Math.round((totalDays * weights[index]!) / weightSum));
    assigned += days;
    return { id: stage.id, durationDays: days };
  });
}
