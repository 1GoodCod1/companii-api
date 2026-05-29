import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, type MeasurementMap } from '../category-shared.util';
import {
  type CompanyPricingModifiers,
  resolvePricingModifierFactor,
} from '../../../../../../prisma/estimate-pricing-modifiers';

export function resolveFacadeHeightMultiplier(
  buildingHeightM: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const height = readNumber({ buildingHeightM }, 'buildingHeightM') ?? 0;
  return height > 9 ? resolvePricingModifierFactor('fatade.height.over9m', overrides) : 1.0;
}

export function deriveFatadeMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
  overrides?: CompanyPricingModifiers | null,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };
  const pointsCount = (type: string) => plan2d?.points?.filter((point) => point.type === type).length ?? 0;

  const facadeArea = Math.max(
    1,
    readNumber(diagnostic, 'facadeArea') ??
      measurements.facadeArea ??
      measurements.scaffoldingArea ??
      (measurements.totalFloorArea ? round2(measurements.totalFloorArea * 2.2) : 40),
  );

  measurements.facadeArea = facadeArea;
  measurements.scaffoldingArea = readNumber(diagnostic, 'scaffoldingArea') ?? facadeArea;

  const insulationThicknessCm = readNumber(diagnostic, 'insulationThicknessCm') ?? 10;
  measurements.insulationThicknessCm = insulationThicknessCm;
  measurements.insulationVolumeM3 = round2(facadeArea * (insulationThicknessCm / 100));
  const wallMaterial = String(diagnostic?.wallMaterial ?? 'brick').toLowerCase();
  const dowelDensityPerM2 =
    wallMaterial === 'bca' ? 8 :
    wallMaterial === 'panel' ? 5 :
    (wallMaterial === 'wood_frame' || wallMaterial === 'wood') ? 3 :
    6;
  measurements.dowelQty = Math.ceil(facadeArea * dowelDensityPerM2);
  measurements.meshArea = round2(facadeArea * 1.1);

  const buildingHeightM = readNumber(diagnostic, 'buildingHeightM') ?? 0;
  measurements.buildingHeightM = buildingHeightM;
  measurements.heightMultiplier = resolveFacadeHeightMultiplier(buildingHeightM, overrides);
  measurements.facadeAreaLabor = round2(facadeArea * measurements.heightMultiplier);
  measurements.meshAreaLabor = round2(measurements.meshArea * measurements.heightMultiplier);
  measurements.preparationArea = facadeArea;
  measurements.preparationAreaLabor = measurements.facadeAreaLabor;

  measurements.windowSlopeLengthM =
    readNumber(diagnostic, 'windowSlopeLengthM') ??
    (pointsCount('window_slope') > 0 ? pointsCount('window_slope') * 1.8 : 0);
  measurements.decorativePlasterArea = readNumber(diagnostic, 'decorativePlasterArea') ?? 0;
  measurements.decorativePlasterAreaLabor = round2(
    measurements.decorativePlasterArea * measurements.heightMultiplier,
  );
  measurements.basePlinthArea = readNumber(diagnostic, 'basePlinthArea') ?? 0;
  measurements.basePlinthAreaLabor = round2(
    measurements.basePlinthArea * measurements.heightMultiplier,
  );
  measurements.paintingArea = measurements.decorativePlasterArea > 0
    ? measurements.decorativePlasterArea
    : facadeArea;
  measurements.paintingAreaLabor = round2(measurements.paintingArea * measurements.heightMultiplier);

  return measurements;
}
