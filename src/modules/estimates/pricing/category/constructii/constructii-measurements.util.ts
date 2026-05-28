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
