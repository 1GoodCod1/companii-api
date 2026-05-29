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

/** Maps plan + UI values (RO/EN) to pricing multiplier. */
export function resolvePlumbingAccessMultiplier(accessDifficulty: unknown): number {
  const normalized = String(accessDifficulty ?? 'easy')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'medium' || normalized === 'mediu') return 1.15;
  if (normalized === 'difficult' || normalized === 'dificil') return 1.35;
  return 1.0;
}

function resolvePipeMaterialMultiplier(pipeMaterial: unknown): number {
  const normalized = String(pipeMaterial ?? 'ppr')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'cupru' || normalized === 'copper') return 1.45;
  if (normalized === 'pex') return 1.2;
  if (normalized === 'multistrat') return 1.15;
  return 1.0; // ppr (default)
}

/**
 * Category-specific measurements for `santehnika` (implementation_plan.md §4.1).
 */
export function deriveSantehnikaMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
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
    explicitPipeLength ?? Math.max(8, roomCount * 6) + (replacePipes ? 15 : 0);

  measurements.drainLengthM = Math.max(4, bathroomCount * 3 + kitchenPoints * 2);
  // Drain replacement: additional length to account for old pipe removal + new routing
  measurements.drainReplaceLengthM = drainReplacement ? Math.max(3, bathroomCount * 2 + kitchenPoints) : 0;
  measurements.waterHeaterCount = waterHeater ? 1 : 0;
  measurements.filterSystemCount = filterSystem ? 1 : 0;
  measurements.riserReplacementCount = riserReplacement ? 1 : 0;
  measurements.wallChasingM = wallChasingM > 0 ? wallChasingM : 0;
  measurements.fittingsQty = Math.ceil(measurements.pipeLengthM * 0.8);
  measurements.demolitionHours = replacePipes
    ? Math.max(2, bathroomCount)
    : Math.max(1, Math.ceil(bathroomCount / 2));

  // Pipe material affects material cost per meter
  const pipeMaterialMultiplier = resolvePipeMaterialMultiplier(diagnostic?.pipeMaterial);
  measurements.pipeMaterialMultiplier = pipeMaterialMultiplier;
  measurements.pipeLengthMMaterial = round2(measurements.pipeLengthM * pipeMaterialMultiplier);

  const complexityMultiplier = resolvePlumbingAccessMultiplier(diagnostic?.accessDifficulty);
  measurements.complexityMultiplier = complexityMultiplier;
  measurements.pipeLengthMLabor = measurements.pipeLengthM;
  measurements.drainLengthMLabor = measurements.drainLengthM;
  measurements.plumbingPointsLabor = measurements.plumbingPoints;
  // Material costs for plumbing fixtures (separate from labor)
  measurements.plumbingPointsMaterial = measurements.plumbingPoints;

  return measurements;
}
