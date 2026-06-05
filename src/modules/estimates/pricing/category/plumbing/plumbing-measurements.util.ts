import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';
import {
  type CompanyPricingModifiers,
  resolvePricingModifierFactor,
} from '../../../../../../prisma/estimate-pricing-modifiers';

export function resolvePlumbingAccessMultiplier(
  accessDifficulty: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = String(accessDifficulty ?? 'easy')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'medium' || normalized === 'mediu') return resolvePricingModifierFactor('santehnika.accessDifficulty.medium', overrides);
  if (normalized === 'difficult' || normalized === 'dificil') return resolvePricingModifierFactor('santehnika.accessDifficulty.difficult', overrides);
  return 1.0;
}

function resolvePipeMaterialMultiplier(
  pipeMaterial: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = String(pipeMaterial ?? 'ppr')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'cupru' || normalized === 'copper') return resolvePricingModifierFactor('santehnika.pipeMaterial.cupru', overrides);
  if (normalized === 'pex') return resolvePricingModifierFactor('santehnika.pipeMaterial.pex', overrides);
  if (normalized === 'multistrat') return resolvePricingModifierFactor('santehnika.pipeMaterial.multistrat', overrides);
  return 1.0;
}

export function deriveSantehnikaMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
  overrides?: CompanyPricingModifiers | null,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };
  const pointsCount = (type: string) => plan2d?.points?.filter((point) => point.type === type).length ?? 0;

  const bathroomCount = Math.max(
    1,
    readNumber(diagnostic, 'bathroomCount') ?? readNumber(measurements, 'bathroomCount') ?? 1,
  );
  const kitchenPoints = readNumber(diagnostic, 'kitchenPoints') ?? 0;
  const bathroomPoints = readNumber(diagnostic, 'bathroomPoints') ?? 0;
  const roomCount = measurements.roomCount ?? bathroomCount;
  const replacePipes = readBoolean(diagnostic, 'replacePipes');
  const waterHeater = readBoolean(diagnostic, 'waterHeater');
  const filterSystem = readBoolean(diagnostic, 'filterSystem');
  const riserReplacement = readBoolean(diagnostic, 'riserReplacement');
  const drainReplacement = readBoolean(diagnostic, 'drainReplacement');
  const wallChasingM = readNumber(diagnostic, 'wallChasingM') ?? 0;

  measurements.bathroomCount = bathroomCount;
  measurements.kitchenPoints = kitchenPoints;
  measurements.bathroomPoints = bathroomPoints;

  const planPlumbingPoints =
    pointsCount('water') + pointsCount('drain') + pointsCount('mixer') + pointsCount('toilet');
  if (planPlumbingPoints > 0) {
    measurements.plumbingPoints = planPlumbingPoints;
  } else {
    measurements.plumbingPoints = Math.max(1, bathroomCount * 2 + kitchenPoints + bathroomPoints);
  }

  const explicitPipeLength = readNumber(diagnostic, 'pipeLengthM');
  measurements.pipeLengthM =
    explicitPipeLength && explicitPipeLength > 0
      ? explicitPipeLength
      : Math.max(8, roomCount * 6) + (replacePipes ? 15 : 0);

  measurements.drainLengthM = Math.max(4, bathroomCount * 3 + kitchenPoints * 2);
  measurements.drainReplaceLengthM = drainReplacement ? Math.max(3, bathroomCount * 2 + kitchenPoints) : 0;

  const explicitWaterHeaterCount = readNumber(diagnostic, 'waterHeaterCount');
  measurements.waterHeaterCount = explicitWaterHeaterCount ?? (waterHeater ? 1 : 0);

  const explicitFilterSystemCount = readNumber(diagnostic, 'filterSystemCount');
  measurements.filterSystemCount = explicitFilterSystemCount ?? (filterSystem ? 1 : 0);

  const explicitRiserReplacementCount = readNumber(diagnostic, 'riserReplacementCount');
  measurements.riserReplacementCount = explicitRiserReplacementCount ?? (riserReplacement ? 1 : 0);
  measurements.wallChasingM = wallChasingM > 0 ? wallChasingM : 0;
  measurements.fittingsQty = Math.ceil(measurements.pipeLengthM * 0.8);
  measurements.demolitionHours = replacePipes
    ? Math.max(2, bathroomCount)
    : Math.max(1, Math.ceil(bathroomCount / 2));
  const pipeMaterialMultiplier = resolvePipeMaterialMultiplier(diagnostic?.pipeMaterial, overrides);
  measurements.pipeMaterialMultiplier = pipeMaterialMultiplier;
  measurements.pipeLengthMMaterial = round2(measurements.pipeLengthM * pipeMaterialMultiplier);

  const complexityMultiplier = resolvePlumbingAccessMultiplier(diagnostic?.accessDifficulty, overrides);
  measurements.complexityMultiplier = complexityMultiplier;
  measurements.pipeLengthMLabor = measurements.pipeLengthM;
  measurements.drainLengthMLabor = measurements.drainLengthM;
  measurements.plumbingPointsLabor = measurements.plumbingPoints;
  measurements.plumbingPointsMaterial = measurements.plumbingPoints;

  return measurements;
}
