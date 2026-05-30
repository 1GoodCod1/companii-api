/**
 * Shared cleaning parity scenarios — keep in sync with frontend parity tests.
 */
export type CleaningParityScenario = {
  label: string;
  diagnostic: Record<string, unknown>;
  expected: Partial<Record<string, number>>;
};

export const CLEANING_PARITY_VECTORS: CleaningParityScenario[] = [
  {
    label: 'default standard 40 m²',
    diagnostic: { cleanArea: 40, cleaningType: 'standard' },
    expected: {
      cleanArea: 40,
      standardCleanAreaLabor: 40,
      deepCleanAreaLabor: 0,
      postConstructionAreaLabor: 0,
      dryCleanAreaLabor: 16,
      totalCleaningMultiplier: 1,
      windowCleanCount: 0,
      bathroomCleanUnits: 0,
    },
  },
  {
    label: 'deep cleaning uses real area, multiplier separate',
    diagnostic: { cleanArea: 40, cleaningType: 'deep', furniturePresent: true },
    expected: {
      standardCleanAreaLabor: 0,
      deepCleanAreaLabor: 40,
      totalCleaningMultiplier: 1.49,
    },
  },
  {
    label: 'post-construction replaces standard area labor',
    diagnostic: { cleanArea: 80, cleaningType: 'post_construction', afterRepairDustLevel: 'high' },
    expected: {
      standardCleanAreaLabor: 0,
      deepCleanAreaLabor: 0,
      postConstructionAreaLabor: 80,
      totalCleaningMultiplier: 2.23,
    },
  },
  {
    label: 'move_out uses standard area path with multiplier',
    diagnostic: { cleanArea: 60, cleaningType: 'move_out' },
    expected: {
      standardCleanAreaLabor: 60,
      deepCleanAreaLabor: 0,
      totalCleaningMultiplier: 1.25,
    },
  },
];

export function assertNoNaNInMeasurements(measurements: Record<string, number>): void {
  for (const [key, value] of Object.entries(measurements)) {
    if (typeof value === 'number' && Number.isNaN(value)) {
      throw new Error(`NaN measurement key: ${key}`);
    }
  }
}
