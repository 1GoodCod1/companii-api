import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';
import {
  type CompanyPricingModifiers,
  resolvePricingModifierFactor,
} from '../../../../../../prisma/estimate-pricing-modifiers';
import {
  computeRectangularRoofBaseArea,
  computeRectangularRoofPerimeter,
  computeRidgeLength,
  computeRoofAreaFromSlope,
  computeRoofSlopeCoefficient,
  deriveValleyLengthFromShape,
  getPrimaryRoofDimensions,
  getRoofInteractiveDrawingReasons,
  inferRoofShapeFromPlan,
  normalizeRoofShape,
  shouldRequireRoofManualReview,
} from './roof-geometry.util';

export {
  computeRoofAreaFromSlope,
  computeRoofSlopeCoefficient,
  deriveValleyLengthFromShape,
  shouldRequireRoofManualReview,
} from './roof-geometry.util';

export function resolveRoofShapeMultiplier(
  roofShape: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = normalizeRoofShape(roofShape);
  if (normalized === 'complex') return resolvePricingModifierFactor('acoperis.roofShape.complex', overrides);
  if (normalized === 'l-shape' || normalized === 'l') return resolvePricingModifierFactor('acoperis.roofShape.l-shape', overrides);
  if (normalized === 't-shape' || normalized === 't') return resolvePricingModifierFactor('acoperis.roofShape.t-shape', overrides);
  if (normalized === 'u-shape' || normalized === 'u') return resolvePricingModifierFactor('acoperis.roofShape.u-shape', overrides);
  return 1.0;
}

function resolveCoveringMultiplier(coveringType: unknown, overrides?: CompanyPricingModifiers | null): number {
  const normalized = String(coveringType ?? 'metal_tile').trim().toLowerCase();
  if (normalized === 'ceramic_tile') return resolvePricingModifierFactor('acoperis.covering.ceramic_tile', overrides);
  if (normalized === 'bituminous_shingle') return resolvePricingModifierFactor('acoperis.covering.bituminous_shingle', overrides);
  if (normalized === 'standing_seam') return resolvePricingModifierFactor('acoperis.covering.standing_seam', overrides);
  if (normalized === 'ondulin') return resolvePricingModifierFactor('acoperis.covering.ondulin', overrides);
  if (normalized === 'other') return resolvePricingModifierFactor('acoperis.covering.other', overrides);
  return 1.0;
}

function resolveMembraneMultiplier(membraneType: unknown, overrides?: CompanyPricingModifiers | null): number {
  const normalized = String(membraneType ?? 'anticondens').trim().toLowerCase();
  if (normalized === 'anticondens') return resolvePricingModifierFactor('acoperis.membrane.anticondens', overrides);
  if (normalized === 'diffusion') return resolvePricingModifierFactor('acoperis.membrane.diffusion', overrides);
  if (normalized === 'superdiffusion') return resolvePricingModifierFactor('acoperis.membrane.superdiffusion', overrides);
  if (normalized === 'premium') return resolvePricingModifierFactor('acoperis.membrane.premium', overrides);
  return 1.0;
}

function resolveInsulationMultiplier(thickness: unknown): number {
  const mm = Number(thickness ?? 150);
  if (mm >= 250) return 2.5;
  if (mm >= 200) return 2.0;
  if (mm >= 150) return 1.5;
  return 1.0;
}

export function deriveAcoperisMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
  overrides?: CompanyPricingModifiers | null,
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
    diagnostic?.roofShape ?? inferRoofShapeFromPlan(plan2d) ?? 'rectangle';
  const roofOverhangM = Math.max(0, readNumber(diagnostic, 'roofOverhangM') ?? plan2d?.globalParameters?.roofOverhangM ?? 0.4);
  const primaryRoof = getPrimaryRoofDimensions(plan2d, baseArea);
  const geometricBaseArea = plan2d?.rooms?.length
    ? computeRectangularRoofBaseArea(primaryRoof.width, primaryRoof.length, roofOverhangM)
    : baseArea;

  measurements.baseArea = baseArea;
  measurements.roofSlope = roofSlope;
  measurements.roofOverhangM = roofOverhangM;
  measurements.roofSlopeCoefficient = computeRoofSlopeCoefficient(roofSlope);

  measurements.roofArea = computeRoofAreaFromSlope(geometricBaseArea, roofSlope);
  measurements.coveringAreaQty = measurements.roofArea;
  measurements.membraneAreaQty = measurements.roofArea;
  measurements.timberVolumeM3 = round2(measurements.roofArea * 0.07);

  const complexityMultiplier = resolveRoofShapeMultiplier(roofShape, overrides);
  measurements.complexityMultiplier = complexityMultiplier;
  measurements.roofAreaLabor = round2(measurements.roofArea * complexityMultiplier);
  measurements.coveringMaterialMultiplier = resolveCoveringMultiplier(diagnostic?.coveringType, overrides);
  measurements.coveringLaborMultiplier = measurements.coveringMaterialMultiplier > 1 ? round2(1 + (measurements.coveringMaterialMultiplier - 1) * 0.5) : 1;
  measurements.membraneMaterialMultiplier = resolveMembraneMultiplier(diagnostic?.membraneType, overrides);

  const manualValley = readNumber(diagnostic, 'valleyLengthM');
  measurements.valleyLengthM = deriveValleyLengthFromShape(roofShape, manualValley);

  const manualWallIntersection = readNumber(diagnostic, 'wallIntersectionLengthM');
  measurements.wallIntersectionLengthM =
    manualWallIntersection ??
    (plan2d?.rooms && plan2d.rooms.length > 1 ? 8 : 0);

  const perimeterEstimate = plan2d?.rooms?.length
    ? computeRectangularRoofPerimeter(primaryRoof.width, primaryRoof.length, roofOverhangM)
    : round2(Math.sqrt(baseArea) * 4);
  const manualGutterLength = readNumber(diagnostic, 'gutterLengthM') ?? plan2d?.globalParameters?.roofGutterLengthM;
  measurements.gutterLengthM =
    manualGutterLength ?? Math.max(10, perimeterEstimate);

  measurements.ridgeLengthM =
    readNumber(diagnostic, 'ridgeLengthM') ??
    computeRidgeLength({
      width: primaryRoof.width,
      length: primaryRoof.length,
      roofType: primaryRoof.roofType,
      overhangM: roofOverhangM,
    });
  measurements.soffitLengthM =
    readNumber(diagnostic, 'soffitLengthM') ?? Math.max(10, perimeterEstimate);
  measurements.roofDripEdgeLengthM =
    readNumber(diagnostic, 'roofDripEdgeLengthM') ?? measurements.gutterLengthM;

  measurements.chimneyCount =
    readNumber(diagnostic, 'chimneyCount') ?? Math.max(0, pointsCount('chimney'));
  measurements.skylightCount = Math.max(
    0,
    readNumber(diagnostic, 'skylightCount') ?? pointsCount('skylight'),
  );

  const oldRoofRemoval = readBoolean(diagnostic, 'oldRoofRemoval');
  measurements.oldRoofRemovalArea = oldRoofRemoval ? measurements.roofArea : 0;
  measurements.demolitionArea = measurements.oldRoofRemovalArea;
  measurements.wasteRemovalArea = measurements.oldRoofRemovalArea;

  const insulationRequired = readBoolean(diagnostic, 'insulationRequired');
  measurements.insulationArea = insulationRequired ? measurements.roofArea : 0;
  measurements.insulationThicknessMm = readNumber(diagnostic, 'insulationThicknessMm') ?? 150;
  measurements.insulationMaterialMultiplier = resolveInsulationMultiplier(measurements.insulationThicknessMm);

  const snowGuardLengthM = readNumber(diagnostic, 'snowGuardLengthM') ?? measurements.ridgeLengthM;
  const snowGuardRows = Math.max(1, readNumber(diagnostic, 'snowGuardRows') ?? 1);
  measurements.snowGuardLengthM = snowGuardLengthM;
  measurements.snowGuardRows = snowGuardRows;
  measurements.snowGuardTotalM = round2(snowGuardLengthM * snowGuardRows);
  const buildingHeightM = readNumber(diagnostic, 'buildingHeightM') ?? 0;
  const storyCount = readNumber(diagnostic, 'storyCount') ?? 1;
  const scaffoldingRequired = readBoolean(diagnostic, 'scaffoldingRequired') || buildingHeightM >= 6 || storyCount >= 2;
  measurements.buildingHeightM = buildingHeightM;
  measurements.storyCount = storyCount;
  measurements.scaffoldingLengthM = scaffoldingRequired ? measurements.gutterLengthM : 0;
  measurements.requiresManualReview = shouldRequireRoofManualReview(roofSlope, roofShape) ? 1 : 0;
  const interactiveDrawingReasons = getRoofInteractiveDrawingReasons({
    plan2d,
    roofSlopeDegrees: roofSlope,
    roofShape,
    valleyLengthM: measurements.valleyLengthM,
    wallIntersectionLengthM: measurements.wallIntersectionLengthM,
    chimneyCount: measurements.chimneyCount,
    skylightCount: measurements.skylightCount,
  });
  measurements.requiresInteractiveDrawing = interactiveDrawingReasons.length > 0 ? 1 : 0;
  measurements.roofGeometryComplexityScore = interactiveDrawingReasons.length;

  return measurements;
}
