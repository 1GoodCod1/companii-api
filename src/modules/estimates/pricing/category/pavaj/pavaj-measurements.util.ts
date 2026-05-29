import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';
import {
  type CompanyPricingModifiers,
  resolvePricingModifierFactor,
} from '../../../../../../prisma/estimate-pricing-modifiers';

export function resolvePatternMultiplier(
  patternComplexity: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = String(patternComplexity ?? 'simple')
    .trim()
    .toLowerCase();

  if (normalized === 'decorative') return resolvePricingModifierFactor('pavaj.patternComplexity.decorative', overrides);
  if (normalized === 'mixed') return resolvePricingModifierFactor('pavaj.patternComplexity.mixed', overrides);
  return 1.0;
}

export function resolveLoadMultiplier(
  vehicleLoad: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = String(vehicleLoad ?? 'pedestrian')
    .trim()
    .toLowerCase();

  if (normalized === 'heavy') return resolvePricingModifierFactor('pavaj.vehicleLoad.heavy', overrides);
  if (normalized === 'car') return resolvePricingModifierFactor('pavaj.vehicleLoad.car', overrides);
  return 1.0;
}

function estimatePerimeterFromArea(area: number): number {
  return round2(Math.sqrt(area) * 4);
}

export function derivePavajMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
  overrides?: CompanyPricingModifiers | null,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };

  const planPavementArea = plan2d?.rooms?.reduce(
    (sum, room) => sum + room.width * room.height,
    0,
  );
  const pavementArea = Math.max(
    1,
    readNumber(diagnostic, 'pavementArea') ??
      (planPavementArea != null && planPavementArea > 0 ? round2(planPavementArea) : undefined) ??
      measurements.pavementArea ??
      measurements.totalFloorArea ??
      20,
  );
  measurements.pavementArea = pavementArea;

  const manualBorderLength = readNumber(diagnostic, 'borderLengthM');
  measurements.borderLengthM =
    manualBorderLength != null && manualBorderLength > 0
      ? manualBorderLength
      : Math.max(4, estimatePerimeterFromArea(pavementArea));

  const baseLayerCm = readNumber(diagnostic, 'baseLayerCm') ?? 25;
  const gravelLayerCm = readNumber(diagnostic, 'gravelLayerCm') ?? 15;
  const sandLayerCm = readNumber(diagnostic, 'sandLayerCm') ?? 5;

  measurements.excavationVolumeM3 = round2((pavementArea * baseLayerCm) / 100);

  const loadMultiplier = resolveLoadMultiplier(diagnostic?.vehicleLoad, overrides);
  measurements.loadMultiplier = loadMultiplier;
  measurements.gravelVolumeM3 = round2(((pavementArea * gravelLayerCm) / 100) * loadMultiplier);
  measurements.sandVolumeM3 = round2(((pavementArea * sandLayerCm) / 100) * loadMultiplier);

  const geotextileRequired = readBoolean(diagnostic, 'geotextileRequired');
  measurements.geotextileArea = geotextileRequired ? round2(pavementArea * 1.05) : 0;

  const drainageRequired = readBoolean(diagnostic, 'drainageRequired');
  measurements.drainageLengthM = drainageRequired
    ? round2(measurements.borderLengthM * 0.3)
    : 0;

  measurements.oldSurfaceRemovalArea = Math.max(
    0,
    readNumber(diagnostic, 'oldSurfaceRemovalArea') ?? 0,
  );

  const patternMultiplier = resolvePatternMultiplier(diagnostic?.patternComplexity, overrides);
  measurements.patternMultiplier = patternMultiplier;
  measurements.pavementLaborQty = round2(pavementArea * patternMultiplier * loadMultiplier);
  measurements.compactionArea = pavementArea;
  measurements.handoverUnits = 1;
  measurements.concreteBaseArea = Math.max(0, readNumber(diagnostic, 'concreteBaseArea') ?? 0);
  measurements.manholeCount = Math.max(0, readNumber(diagnostic, 'manholeCount') ?? 0);
  measurements.stepsLengthM = Math.max(0, readNumber(diagnostic, 'stepsLengthM') ?? 0);

  return measurements;
}
