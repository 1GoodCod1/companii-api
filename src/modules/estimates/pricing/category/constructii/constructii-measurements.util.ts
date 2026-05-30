import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';


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
  return 1.0;
}

function resolveSlabTypeMultiplier(slabType: unknown): number {
  const normalized = String(slabType ?? 'monolithic')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'prefab') return 1.25;
  if (normalized === 'wood') return 0.65;
  return 1.0;
}

function resolveFoundationMultiplier(foundationType: unknown): number {
  const normalized = normalizeFoundationType(foundationType ?? 'strip');

  if (normalized === 'slab') return 1.3;
  if (normalized === 'pile') return 1.8;
  if (normalized === 'isolated') return 1.15;
  return 1.0;
}

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

export function resolveStructuralConcreteM3(
  builtAreaTotal: number,
  foundationConcreteM3: number,
  manual?: number,
): number {
  if (manual != null && manual > 0) return round2(manual);
  return round2(Math.max(0, builtAreaTotal * 0.18 - foundationConcreteM3));
}

export function shouldRequireConstructiiManualReview(
  _builtArea: number,
  _storyCount: number,
  _foundationType: unknown,
): boolean {
  return true;
}

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

  measurements.foundationConcreteM3 = resolveFoundationConcreteM3(
    diagnostic?.foundationType,
    builtArea,
    readNumber(diagnostic, 'foundationConcreteM3'),
  );

  measurements.foundationMultiplier = resolveFoundationMultiplier(diagnostic?.foundationType);

  const manualStructural = readNumber(diagnostic, 'concreteVolumeM3');
  measurements.structuralConcreteM3 = resolveStructuralConcreteM3(
    measurements.builtAreaTotal,
    measurements.foundationConcreteM3,
    manualStructural,
  );
  measurements.concreteVolumeM3 = measurements.structuralConcreteM3;

  measurements.foundationRebarKg = round2(measurements.foundationConcreteM3 * 90);
  measurements.structuralRebarKg = round2(measurements.structuralConcreteM3 * 90);

  const manualRebar = readNumber(diagnostic, 'rebarKg');
  measurements.rebarKg =
    manualRebar != null && manualRebar > 0
      ? manualRebar
      : round2(measurements.foundationRebarKg + measurements.structuralRebarKg);

  const manualMasonry = readNumber(diagnostic, 'masonryVolumeM3');
  measurements.masonryVolumeM3 =
    manualMasonry != null && manualMasonry > 0
      ? manualMasonry
      : round2(measurements.builtAreaTotal * 0.22);

  measurements.wallMaterialMultiplier = resolveWallMaterialMultiplier(diagnostic?.wallMaterial);

  measurements.slabTypeMultiplier = resolveSlabTypeMultiplier(diagnostic?.slabType);
  measurements.slabAreaTotal = measurements.builtAreaTotal;

  measurements.waterproofingArea = round2(builtArea * 1.1);
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
  measurements.preliminaryEstimate = 1;

  return measurements;
}
