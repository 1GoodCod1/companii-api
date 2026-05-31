import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';

export const ROOF_COS_GUARD = 0.1;

export const ROOF_INTERACTIVE_DRAWING_THRESHOLDS = {
  steepSlopeDegrees: 60,
  minValleyLengthM: 0,
  minWallIntersectionLengthM: 0,
  minChimneys: 1,
  minSkylights: 1,
  minPlanRooms: 2,
} as const;

export type RoofInteractiveDrawingReason =
  | 'steep_slope'
  | 'complex_shape'
  | 'multi_plane_plan'
  | 'valleys'
  | 'wall_intersections'
  | 'chimneys'
  | 'skylights';

export function normalizeRoofShape(shape: unknown): string {
  return String(shape ?? 'rectangle')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

export function computeRoofAreaFromSlope(baseArea: number, roofSlopeDegrees: number): number {
  const slope = Math.min(75, Math.max(0, roofSlopeDegrees));
  const cosVal = Math.cos((slope * Math.PI) / 180);
  if (slope >= 70 || cosVal <= ROOF_COS_GUARD) {
    return round2(baseArea * 1.15);
  }
  return round2(baseArea / cosVal);
}

export function computeRoofSlopeCoefficient(roofSlopeDegrees: number): number {
  const slope = Math.min(75, Math.max(0, roofSlopeDegrees));
  const cosVal = Math.cos((slope * Math.PI) / 180);
  if (slope >= 70 || cosVal <= ROOF_COS_GUARD) return 1.15;
  return round2(1 / cosVal);
}

export function computeRectangularRoofBaseArea(
  width: number,
  length: number,
  overhangM = 0,
): number {
  return round2(Math.max(0, width + overhangM * 2) * Math.max(0, length + overhangM * 2));
}

export function computeRectangularRoofPerimeter(
  width: number,
  length: number,
  overhangM = 0,
): number {
  return round2(2 * Math.max(0, width + overhangM * 2) + 2 * Math.max(0, length + overhangM * 2));
}

export function computeRidgeLength(params: {
  width: number;
  length: number;
  roofType?: unknown;
  overhangM?: number;
}): number {
  const roofType = String(params.roofType ?? 'gable').trim().toLowerCase();
  if (roofType === 'flat') return 0;
  const width = Math.max(0, params.width + (params.overhangM ?? 0) * 2);
  const length = Math.max(0, params.length + (params.overhangM ?? 0) * 2);
  if (roofType === 'hip') return round2(Math.max(0, length - width));
  return round2(Math.max(width, length));
}

export function getPrimaryRoofDimensions(plan2d: Plan2dData | null | undefined, fallbackArea: number): {
  width: number;
  length: number;
  roofType: string;
} {
  const primaryRoom = plan2d?.rooms?.[0];
  if (primaryRoom && primaryRoom.width > 0 && primaryRoom.height > 0) {
    return {
      width: primaryRoom.width,
      length: primaryRoom.height,
      roofType: String(primaryRoom.roofType ?? 'gable'),
    };
  }

  const side = Math.sqrt(Math.max(0, fallbackArea));
  return { width: side, length: side, roofType: 'gable' };
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
  return (
    roofSlopeDegrees > ROOF_INTERACTIVE_DRAWING_THRESHOLDS.steepSlopeDegrees ||
    normalizeRoofShape(roofShape) === 'complex'
  );
}

export function inferRoofShapeFromPlan(plan2d: Plan2dData | null | undefined): string | undefined {
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

export function getRoofInteractiveDrawingReasons(params: {
  plan2d?: Plan2dData | null;
  roofSlopeDegrees: number;
  roofShape: unknown;
  valleyLengthM?: number;
  wallIntersectionLengthM?: number;
  chimneyCount?: number;
  skylightCount?: number;
}): RoofInteractiveDrawingReason[] {
  const reasons: RoofInteractiveDrawingReason[] = [];
  const thresholds = ROOF_INTERACTIVE_DRAWING_THRESHOLDS;

  if (params.roofSlopeDegrees > thresholds.steepSlopeDegrees) {
    reasons.push('steep_slope');
  }
  if (normalizeRoofShape(params.roofShape) === 'complex') {
    reasons.push('complex_shape');
  }
  if ((params.plan2d?.rooms?.length ?? 0) >= thresholds.minPlanRooms) {
    reasons.push('multi_plane_plan');
  }
  if ((params.valleyLengthM ?? 0) > thresholds.minValleyLengthM) {
    reasons.push('valleys');
  }
  if ((params.wallIntersectionLengthM ?? 0) > thresholds.minWallIntersectionLengthM) {
    reasons.push('wall_intersections');
  }
  if ((params.chimneyCount ?? 0) >= thresholds.minChimneys) {
    reasons.push('chimneys');
  }
  if ((params.skylightCount ?? 0) >= thresholds.minSkylights) {
    reasons.push('skylights');
  }

  return reasons;
}
