import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';

export const ROOF_COS_GUARD = 0.1;


function normalizeRoofShape(shape: unknown): string {
  return String(shape ?? 'rectangle')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

export function resolveRoofShapeMultiplier(roofShape: unknown): number {
  const normalized = normalizeRoofShape(roofShape);
  if (normalized === 'complex') return 1.5;
  if (normalized === 'l-shape' || normalized === 'l') return 1.2;
  if (normalized === 't-shape' || normalized === 'u-shape' || normalized === 't' || normalized === 'u') {
    return 1.35;
  }
  return 1.0;
}

export function computeRoofAreaFromSlope(baseArea: number, roofSlopeDegrees: number): number {
  const slope = Math.min(75, Math.max(0, roofSlopeDegrees));
  const cosVal = Math.cos((slope * Math.PI) / 180);
  if (slope >= 70 || cosVal <= ROOF_COS_GUARD) {
    return round2(baseArea * 1.15);
  }
  return round2((baseArea / cosVal) * 1.12);
}

export function deriveValleyLengthFromShape(
  roofShape: unknown,
  manualValley?: number,
): number {
  if (manualValley != null && manualValley > 0) return manualValley;

  const normalized = normalizeRoofShape(roofShape);
  if (normalized === 'l-shape' || normalized === 'l') return 12;
  if (normalized === 't-shape' || normalized === 'u-shape' || normalized === 't' || normalized === 'u') {
    return 18;
  }
  if (normalized === 'complex') return 24;
  return 0;
}

export function shouldRequireRoofManualReview(
  roofSlopeDegrees: number,
  roofShape: unknown,
): boolean {
  return roofSlopeDegrees > 60 || normalizeRoofShape(roofShape) === 'complex';
}

function inferShapeFromPlan(plan2d: Plan2dData | null | undefined): string | undefined {
  if (!plan2d?.rooms?.length) return undefined;

  let shape = 'rectangle';
  if (plan2d.rooms.length > 1) shape = 'complex';

  for (const room of plan2d.rooms) {
    const roomShape = normalizeRoofShape(room.shapeType);
    if (roomShape === 'l-shape') shape = 'l-shape';
    if (roomShape === 't-shape' || roomShape === 'u-shape') shape = roomShape;
  }
  return shape;
}

export function deriveAcoperisMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };
  const pointsCount = (type: string) => plan2d?.points?.filter((point) => point.type === type).length ?? 0;

  const baseArea = Math.max(
    5,
    readNumber(diagnostic, 'baseArea') ??
      measurements.baseArea ??
      measurements.totalFloorArea ??
      30,
  );
  const roofSlope = Math.min(75, Math.max(0, readNumber(diagnostic, 'roofSlope') ?? 30));
  const roofShape =
    diagnostic?.roofShape ?? inferShapeFromPlan(plan2d) ?? 'rectangle';

  measurements.baseArea = baseArea;
  measurements.roofSlope = roofSlope;

  measurements.roofArea = computeRoofAreaFromSlope(baseArea, roofSlope);
  measurements.timberVolumeM3 = round2(measurements.roofArea * 0.07);

  const complexityMultiplier = resolveRoofShapeMultiplier(roofShape);
  measurements.complexityMultiplier = complexityMultiplier;
  measurements.roofAreaLabor = round2(measurements.roofArea * complexityMultiplier);

  const manualValley = readNumber(diagnostic, 'valleyLengthM');
  measurements.valleyLengthM = deriveValleyLengthFromShape(roofShape, manualValley);

  const manualWallIntersection = readNumber(diagnostic, 'wallIntersectionLengthM');
  measurements.wallIntersectionLengthM =
    manualWallIntersection ??
    (plan2d?.rooms && plan2d.rooms.length > 1 ? 8 : 0);

  const perimeterEstimate = round2(Math.sqrt(baseArea) * 4);
  const planGutterLength = pointsCount('gutter') * 6;
  measurements.gutterLengthM =
    readNumber(diagnostic, 'gutterLengthM') ?? (planGutterLength > 0 ? planGutterLength : Math.max(10, perimeterEstimate));

  measurements.ridgeLengthM =
    readNumber(diagnostic, 'ridgeLengthM') ?? round2(Math.sqrt(baseArea) * 2);
  measurements.soffitLengthM =
    readNumber(diagnostic, 'soffitLengthM') ?? Math.max(10, perimeterEstimate);
  measurements.roofDripEdgeLengthM =
    readNumber(diagnostic, 'roofDripEdgeLengthM') ?? measurements.gutterLengthM;

  measurements.chimneyCount =
    readNumber(diagnostic, 'chimneyCount') ?? Math.max(0, pointsCount('chimney'));

  const oldRoofRemoval = readBoolean(diagnostic, 'oldRoofRemoval');
  measurements.oldRoofRemovalArea = oldRoofRemoval ? measurements.roofArea : 0;
  measurements.demolitionArea = measurements.oldRoofRemovalArea;

  const insulationRequired = readBoolean(diagnostic, 'insulationRequired');
  measurements.insulationArea = insulationRequired ? measurements.roofArea : 0;

  measurements.snowGuardLengthM = measurements.ridgeLengthM;
  measurements.requiresManualReview = shouldRequireRoofManualReview(roofSlope, roofShape) ? 1 : 0;

  return measurements;
}
