import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';

export type MeasurementMap = Record<string, number>;

function readNumber(source: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const value = source?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readBoolean(source: Record<string, unknown> | null | undefined, key: string): boolean {
  const value = source?.[key];
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return false;
}

function normalizeFoundationType(foundationType: unknown): string {
  return String(foundationType ?? 'strip')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

function resolveWallMaterialMultiplier(wallMaterial: unknown): number {
  const normalized = String(wallMaterial ?? 'bca')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'brick' || normalized === 'caramida') return 1.6;
  if (normalized === 'concrete' || normalized === 'beton') return 1.35;
  if (normalized === 'wood_frame') return 0.7;
  return 1.0; // bca (default)
}

function resolveSlabTypeMultiplier(slabType: unknown): number {
  const normalized = String(slabType ?? 'monolithic')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'prefab') return 1.25;
  if (normalized === 'wood') return 0.65;
  return 1.0; // monolithic (default)
}

function resolveFoundationMultiplier(foundationType: unknown): number {
  const normalized = normalizeFoundationType(foundationType ?? 'strip');

  if (normalized === 'slab') return 1.3;
  if (normalized === 'pile') return 1.8;
  if (normalized === 'isolated') return 1.15;
  return 1.0; // strip (default)
}

/** implementation_plan.md §4.12 — MVP uses area-based coefficients only. */
export function resolveFoundationConcreteM3(
  foundationType: unknown,
  builtArea: number,
  manual?: number,
): number {
  if (manual != null && manual > 0) return round2(manual);

  const normalized = normalizeFoundationType(foundationType);
  if (normalized === 'slab') return round2(builtArea * 0.18);
  if (normalized === 'pile') return round2(builtArea * 0.06);
  if (normalized === 'isolated') return round2(builtArea * 0.1);
  return round2(builtArea * 0.14);
}

export function shouldRequireConstructiiManualReview(
  builtArea: number,
  storyCount: number,
  foundationType: unknown,
): boolean {
  return (
    builtArea > 150 ||
    storyCount > 2 ||
    normalizeFoundationType(foundationType) === 'pile'
  );
}

/**
 * Category-specific measurements for `constructii` (implementation_plan.md §4.12).
 * All area/volume formulas are preliminary MVP estimates.
 */
export function deriveConstructiiMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };

  const builtArea = Math.max(
    10,
    readNumber(diagnostic, 'builtArea') ??
      measurements.baseArea ??
      measurements.totalFloorArea ??
      50,
  );
  const storyCount = Math.max(
    1,
    readNumber(diagnostic, 'storyCount') ?? measurements.storyCount ?? 1,
  );

  measurements.builtArea = builtArea;
  measurements.storyCount = storyCount;
  measurements.builtAreaTotal = round2(builtArea * storyCount);

  const manualExcavation = readNumber(diagnostic, 'excavationVolumeM3');
  measurements.excavationVolumeM3 =
    manualExcavation != null && manualExcavation > 0
      ? manualExcavation
      : round2(builtArea * 0.45);

  const manualConcrete = readNumber(diagnostic, 'concreteVolumeM3');
  measurements.concreteVolumeM3 =
    manualConcrete != null && manualConcrete > 0
      ? manualConcrete
      : round2(builtArea * 0.18);

  measurements.foundationConcreteM3 = resolveFoundationConcreteM3(
    diagnostic?.foundationType,
    builtArea,
    readNumber(diagnostic, 'foundationConcreteM3'),
  );

  // Foundation type affects cost per m³ beyond volume
  const foundationMultiplier = resolveFoundationMultiplier(diagnostic?.foundationType);
  measurements.foundationMultiplier = foundationMultiplier;
  measurements.foundationConcreteCostM3 = round2(measurements.foundationConcreteM3 * foundationMultiplier);

  const manualRebar = readNumber(diagnostic, 'rebarKg');
  measurements.rebarKg =
    manualRebar != null && manualRebar > 0
      ? manualRebar
      : round2(measurements.concreteVolumeM3 * 90);

  const manualMasonry = readNumber(diagnostic, 'masonryVolumeM3');
  measurements.masonryVolumeM3 =
    manualMasonry != null && manualMasonry > 0
      ? manualMasonry
      : round2(measurements.builtAreaTotal * 0.22);

  // Wall material affects cost per m³ of masonry
  const wallMaterialMultiplier = resolveWallMaterialMultiplier(diagnostic?.wallMaterial);
  measurements.wallMaterialMultiplier = wallMaterialMultiplier;
  measurements.masonryMaterialM3 = round2(measurements.masonryVolumeM3 * wallMaterialMultiplier);

  // Slab type affects cost per m²
  const slabTypeMultiplier = resolveSlabTypeMultiplier(diagnostic?.slabType);
  measurements.slabTypeMultiplier = slabTypeMultiplier;
  measurements.slabAreaCost = round2(measurements.slabAreaTotal * slabTypeMultiplier);

  measurements.waterproofingArea = round2(builtArea * 1.1);
  measurements.slabAreaTotal = measurements.builtAreaTotal;
  measurements.stairFlightCount = storyCount > 1 ? storyCount - 1 : 0;

  const roofIncluded = readBoolean(diagnostic, 'roofIncluded');
  measurements.roofIncludedArea = roofIncluded ? builtArea : 0;

  measurements.utilitiesUnits = readBoolean(diagnostic, 'utilitiesIncluded') ? 1 : 0;
  measurements.projectDocumentationUnits = readBoolean(diagnostic, 'projectDocumentation') ? 1 : 0;
  measurements.projectHours = 16;
  measurements.handoverUnits = 1;

  measurements.requiresManualReview = shouldRequireConstructiiManualReview(
    builtArea,
    storyCount,
    diagnostic?.foundationType,
  )
    ? 1
    : 0;

  /** MVP: construction estimates are always preliminary (implementation_plan.md §4.12). */
  measurements.preliminaryEstimate = 1;

  return measurements;
}
