import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { ENABLED_WORK_MODULES_KEY } from '../../../utils/work-modules.util';
import {
  type CompanyPricingModifiers,
  resolvePricingModifierFactor,
  resolvePricingModifierPct,
} from '../../../../../../prisma/estimate-pricing-modifiers';
import { readNumber, type MeasurementMap } from '../category-shared.util';


function readEnabledModuleKeys(
  diagnostic: Record<string, unknown> | null | undefined,
): Set<string> {
  const raw = diagnostic?.[ENABLED_WORK_MODULES_KEY];
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((key): key is string => typeof key === 'string'));
}
function resolveModuleQuantity(
  diagnostic: Record<string, unknown> | null | undefined,
  key: string,
  moduleKey: string,
  enabledModules: Set<string>,
  computedWhenEnabled?: number,
): number {
  const explicit = readNumber(diagnostic, key);
  if (explicit != null && explicit > 0) return explicit;
  if (enabledModules.has(moduleKey) && computedWhenEnabled != null) return computedWhenEnabled;
  if (explicit != null) return Math.max(0, explicit);
  return 0;
}

export function resolveSurfaceConditionMultiplier(
  surfaceCondition: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = String(surfaceCondition ?? 'new')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'very_bad' || normalized === 'foarte_proasta' || normalized === 'foarte proasta') {
    return resolvePricingModifierFactor('finishing.surfaceCondition.very_bad', overrides);
  }
  if (normalized === 'old' || normalized === 'vechi') {
    return resolvePricingModifierFactor('finishing.surfaceCondition.old', overrides);
  }
  return 1.0;
}

export function resolveFinishLevelPremiumAdd(
  finishLevel: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = String(finishLevel ?? 'standard')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  return normalized === 'premium'
    ? resolvePricingModifierPct('finishing.finishLevel.premium', overrides) / 100
    : 0;
}

export function resolveFinisajComplexityMultiplier(
  surfaceCondition: unknown,
  finishLevel: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  return round2(
    resolveSurfaceConditionMultiplier(surfaceCondition, overrides) +
      resolveFinishLevelPremiumAdd(finishLevel, overrides),
  );
}

/** Rough perimeter of a roughly-square footprint: 4·√area. Used for baseboards. */
function estimatePerimeterM(floorArea: number): number {
  return round2(4 * Math.sqrt(floorArea));
}

export function deriveFinisajMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
  overrides?: CompanyPricingModifiers | null,
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
  measurements.roomPerimeterM = estimatePerimeterM(floorArea);
  const computedWallArea = round2(floorArea * 2.5 * (wallHeight / 2.7));
  const computedCeilingArea = readNumber(diagnostic, 'ceilingArea') ?? floorArea;
  const skinArea = round2(computedWallArea + computedCeilingArea);
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
    computedWallArea,
  );
  measurements.puttyArea = resolveModuleQuantity(
    diagnostic,
    'puttyArea',
    'putty',
    enabledModules,
    skinArea,
  );
  measurements.tileArea = resolveModuleQuantity(diagnostic, 'tileArea', 'tile', enabledModules);
  measurements.flooringArea = resolveModuleQuantity(
    diagnostic,
    'flooringArea',
    'flooring',
    enabledModules,
  );
  measurements.parquetArea = resolveModuleQuantity(
    diagnostic,
    'parquetArea',
    'parquet',
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
  measurements.partitionArea = resolveModuleQuantity(
    diagnostic,
    'partitionArea',
    'partition',
    enabledModules,
  );
  measurements.stretchCeilingArea = resolveModuleQuantity(
    diagnostic,
    'stretchCeilingArea',
    'stretch_ceiling',
    enabledModules,
    floorArea,
  );
  measurements.decorativePlasterArea = resolveModuleQuantity(
    diagnostic,
    'decorativePlasterArea',
    'decorative_plaster',
    enabledModules,
  );
  measurements.waterproofingArea = resolveModuleQuantity(
    diagnostic,
    'waterproofingArea',
    'waterproofing',
    enabledModules,
  );
  measurements.wallpaperArea = resolveModuleQuantity(
    diagnostic,
    'wallpaperArea',
    'wallpaper',
    enabledModules,
  );

  const paintDefault = round2(
    Math.max(
      0,
      skinArea - measurements.wallpaperArea - measurements.decorativePlasterArea,
    ),
  );
  measurements.paintArea = resolveModuleQuantity(
    diagnostic,
    'paintArea',
    'paint',
    enabledModules,
    paintDefault,
  );

  measurements.preparationArea = resolveModuleQuantity(
    diagnostic,
    'preparationArea',
    'surface_preparation',
    enabledModules,
    skinArea,
  );
  measurements.baseboardLengthM = resolveModuleQuantity(
    diagnostic,
    'baseboardLengthM',
    'baseboards',
    enabledModules,
    measurements.roomPerimeterM,
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
    overrides,
  );
  measurements.complexityMultiplier = complexityMultiplier;
  measurements.surfaceConditionMultiplier = resolveSurfaceConditionMultiplier(
    diagnostic?.surfaceCondition,
    overrides,
  );

  const withLabor = (area: number) => round2(area * complexityMultiplier);
  measurements.demolitionAreaLabor = withLabor(measurements.demolitionArea);
  measurements.plasterAreaLabor = withLabor(measurements.plasterArea);
  measurements.puttyAreaLabor = withLabor(measurements.puttyArea);
  measurements.paintAreaLabor = withLabor(measurements.paintArea);
  measurements.wallpaperAreaLabor = withLabor(measurements.wallpaperArea);
  measurements.decorativePlasterAreaLabor = withLabor(measurements.decorativePlasterArea);
  measurements.drywallAreaLabor = withLabor(measurements.drywallArea);
  measurements.partitionAreaLabor = withLabor(measurements.partitionArea);
  measurements.ceilingAreaLabor = withLabor(measurements.ceilingArea);
  measurements.stretchCeilingAreaLabor = withLabor(measurements.stretchCeilingArea);
  measurements.tileAreaLabor = withLabor(measurements.tileArea);
  measurements.waterproofingAreaLabor = withLabor(measurements.waterproofingArea);
  measurements.flooringAreaLabor = withLabor(measurements.flooringArea);
  measurements.parquetAreaLabor = withLabor(measurements.parquetArea);
  measurements.screedAreaLabor = withLabor(measurements.screedArea);
  measurements.preparationAreaLabor = withLabor(measurements.preparationArea);
  measurements.cleaningArea = enabledModules.has('cleaning') ? floorArea : 0;

  return measurements;
}
