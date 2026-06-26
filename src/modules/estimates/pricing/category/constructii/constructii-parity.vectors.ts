export type ConstructiiParityScenario = {
  label: string;
  diagnostic: Record<string, unknown>;
  expected: Partial<Record<string, number>>;
};

export const CONSTRUCTII_PARITY_VECTORS: ConstructiiParityScenario[] = [
  {
    label: 'default single-story footprint',
    diagnostic: { builtArea: 50, storyCount: 1 },
    expected: {
      builtAreaTotal: 50,
      foundationConcreteM3: 7,
      structuralConcreteM3: 2,
      concreteVolumeM3: 2,
      foundationRebarKg: 630,
      structuralRebarKg: 180,
      rebarKg: 810,
      slabAreaTotal: 50,
      stairFlightCount: 0,
      requiresManualReview: 1,
      preliminaryEstimate: 1,
    },
  },
  {
    label: 'two-story scales structural concrete and rebar',
    diagnostic: { builtArea: 150, storyCount: 2 },
    expected: {
      builtAreaTotal: 300,
      foundationConcreteM3: 21,
      structuralConcreteM3: 33,
      slabAreaTotal: 300,
      rebarKg: 4860,
      stairFlightCount: 1,
    },
  },
  {
    label: 'prefab slab multiplier stays in unitPrice path',
    diagnostic: { builtArea: 100, storyCount: 1, slabType: 'prefab' },
    expected: { slabTypeMultiplier: 1.25, slabAreaTotal: 100 },
  },
  {
    label: 'brick wall material multiplier stays in unitPrice path',
    diagnostic: { builtArea: 100, storyCount: 1, wallMaterial: 'brick' },
    expected: { wallMaterialMultiplier: 1.6, masonryVolumeM3: 22 },
  },
  {
    label: 'small MVP object still requires manual review',
    diagnostic: { builtArea: 80, storyCount: 1, foundationType: 'strip' },
    expected: { requiresManualReview: 1 },
  },
];

export function assertNoNaNInMeasurements(measurements: Record<string, number>): void {
  for (const [key, value] of Object.entries(measurements)) {
    if (typeof value === 'number' && Number.isNaN(value)) {
      throw new Error(`NaN measurement key: ${key}`);
    }
  }
}
