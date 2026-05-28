import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { ENABLED_WORK_MODULES_KEY } from '../../../utils/work-modules.util';

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

function readOptionalArea(
  diagnostic: Record<string, unknown> | null | undefined,
  key: string,
): number {
  return Math.max(0, readNumber(diagnostic, key) ?? 0);
}

function readEnabledModuleKeys(
  diagnostic: Record<string, unknown> | null | undefined,
): Set<string> {
  const raw = diagnostic?.[ENABLED_WORK_MODULES_KEY];
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((key): key is string => typeof key === 'string'));
}

/** Optional module qty: explicit diagnostic value, else 0 unless module enabled (no finishArea fallback). */
function resolveModuleQuantity(
  diagnostic: Record<string, unknown> | null | undefined,
  key: string,
  moduleKey: string,
  enabledModules: Set<string>,
  computedWhenEnabled?: number,
): number {
  const explicit = readNumber(diagnostic, key);
  if (explicit != null) return Math.max(0, explicit);
  if (!enabledModules.has(moduleKey)) return 0;
  return computedWhenEnabled ?? 0;
}

/** implementation_plan.md §4.4 — new 1.0, old 1.15, very_bad 1.35 */
export function resolveSurfaceConditionMultiplier(surfaceCondition: unknown): number {
  const normalized = String(surfaceCondition ?? 'new')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'very_bad' || normalized === 'foarte_proasta' || normalized === 'foarte proasta') {
    return 1.35;
  }
  if (normalized === 'old' || normalized === 'vechi') return 1.15;
  return 1.0;
}

export function resolveFinishLevelPremiumAdd(finishLevel: unknown): number {
  const normalized = String(finishLevel ?? 'standard')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  return normalized === 'premium' ? 0.15 : 0;
}

export function resolveFinisajComplexityMultiplier(
  surfaceCondition: unknown,
  finishLevel: unknown,
): number {
  return round2(
    resolveSurfaceConditionMultiplier(surfaceCondition) +
      resolveFinishLevelPremiumAdd(finishLevel),
  );
}

/**
 * Category-specific measurements for `lucrari-finisaj` (implementation_plan.md §4.4).
 */
export function deriveFinisajMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };

  const floorArea = Math.max(
    1,
    readNumber(diagnostic, 'finishArea') ??
      measurements.finishArea ??
      measurements.totalFloorArea ??
      30,
  );
  const wallHeight = readNumber(diagnostic, 'wallHeight') ?? 2.7;

  measurements.finishArea = floorArea;
  measurements.wallHeight = wallHeight;

  const computedWallArea = round2(floorArea * 2.5);
  const computedCeilingArea = readNumber(diagnostic, 'ceilingArea') ?? floorArea;
  const enabledModules = readEnabledModuleKeys(diagnostic);

  measurements.wallArea = computedWallArea;
  measurements.ceilingArea = resolveModuleQuantity(
    diagnostic,
    'ceilingArea',
    'ceiling',
    enabledModules,
    computedCeilingArea,
  );

  measurements.demolitionArea = resolveModuleQuantity(
    diagnostic,
    'demolitionArea',
    'demolition',
    enabledModules,
  );
  measurements.plasterArea = resolveModuleQuantity(
    diagnostic,
    'plasterArea',
    'plaster',
    enabledModules,
  );
  measurements.puttyArea = resolveModuleQuantity(
    diagnostic,
    'puttyArea',
    'putty',
    enabledModules,
  );
  measurements.tileArea = resolveModuleQuantity(diagnostic, 'tileArea', 'tile', enabledModules);
  measurements.flooringArea = resolveModuleQuantity(
    diagnostic,
    'flooringArea',
    'flooring',
    enabledModules,
  );
  measurements.screedArea = resolveModuleQuantity(
    diagnostic,
    'screedArea',
    'screed',
    enabledModules,
  );
  measurements.drywallArea = resolveModuleQuantity(
    diagnostic,
    'drywallArea',
    'drywall',
    enabledModules,
  );
  measurements.wallpaperArea = resolveModuleQuantity(
    diagnostic,
    'wallpaperArea',
    'wallpaper',
    enabledModules,
  );

  measurements.paintArea = resolveModuleQuantity(
    diagnostic,
    'paintArea',
    'paint',
    enabledModules,
    round2(computedWallArea + computedCeilingArea),
  );

  measurements.preparationArea = enabledModules.has('plaster')
    ? floorArea
    : readOptionalArea(diagnostic, 'preparationArea');
  measurements.baseboardLengthM = resolveModuleQuantity(
    diagnostic,
    'baseboardLengthM',
    'baseboards',
    enabledModules,
    round2(floorArea * 1.15),
  );
  measurements.doorSlopeLengthM = resolveModuleQuantity(
    diagnostic,
    'doorSlopeLengthM',
    'slopes',
    enabledModules,
  );

  const complexityMultiplier = resolveFinisajComplexityMultiplier(
    diagnostic?.surfaceCondition,
    diagnostic?.finishLevel,
  );
  measurements.complexityMultiplier = complexityMultiplier;
  measurements.surfaceConditionMultiplier = resolveSurfaceConditionMultiplier(
    diagnostic?.surfaceCondition,
  );

  const withLabor = (area: number) => round2(area * complexityMultiplier);
  measurements.demolitionAreaLabor = withLabor(measurements.demolitionArea);
  measurements.plasterAreaLabor = withLabor(measurements.plasterArea);
  measurements.puttyAreaLabor = withLabor(measurements.puttyArea);
  measurements.paintAreaLabor = withLabor(measurements.paintArea);
  measurements.wallpaperAreaLabor = withLabor(measurements.wallpaperArea);
  measurements.drywallAreaLabor = withLabor(measurements.drywallArea);
  measurements.ceilingAreaLabor = withLabor(measurements.ceilingArea);
  measurements.tileAreaLabor = withLabor(measurements.tileArea);
  measurements.flooringAreaLabor = withLabor(measurements.flooringArea);
  measurements.screedAreaLabor = withLabor(measurements.screedArea);
  measurements.preparationAreaLabor = withLabor(measurements.preparationArea);
  measurements.cleaningArea = enabledModules.has('cleaning') ? floorArea : 0;

  return measurements;
}
