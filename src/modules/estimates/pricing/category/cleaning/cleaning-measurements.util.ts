import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';


/** implementation_plan.md §4.9 */
export function resolveCleaningTypeMultiplier(cleaningType: unknown): number {
  const normalized = String(cleaningType ?? 'standard')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');

  if (normalized === 'post_construction') return 1.65;
  if (normalized === 'deep') return 1.35;
  if (normalized === 'move_out') return 1.25;
  return 1.0;
}

export function resolveDustMultiplier(afterRepairDustLevel: unknown): number {
  const normalized = String(afterRepairDustLevel ?? 'low')
    .trim()
    .toLowerCase();

  if (normalized === 'high') return 1.35;
  if (normalized === 'medium') return 1.15;
  return 1.0;
}

export function resolveCombinedCleaningMultiplier(
  cleaningType: unknown,
  afterRepairDustLevel: unknown,
  furniturePresent?: boolean,
): number {
  let multiplier = resolveCleaningTypeMultiplier(cleaningType) * resolveDustMultiplier(afterRepairDustLevel);
  if (furniturePresent) multiplier *= 1.1;
  return round2(multiplier);
}

export function deriveCleaningMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };
  const pointsCount = (type: string) => plan2d?.points?.filter((point) => point.type === type).length ?? 0;

  const cleanArea = Math.max(
    1,
    readNumber(diagnostic, 'cleanArea') ?? measurements.cleanArea ?? measurements.totalFloorArea ?? 40,
  );
  measurements.cleanArea = cleanArea;

  const planWindowCount = pointsCount('window_clean');
  measurements.windowCleanCount =
    readNumber(diagnostic, 'windowCount') ?? (planWindowCount > 0 ? planWindowCount : 0);

  measurements.bathroomCount = readNumber(diagnostic, 'bathroomCount') ?? 0;
  measurements.kitchenDeepCleanUnits = readBoolean(diagnostic, 'kitchenDeepClean') ? 1 : 0;

  const cleaningType = diagnostic?.cleaningType ?? 'standard';
  const furniturePresent = readBoolean(diagnostic, 'furniturePresent');
  measurements.complexityMultiplier = resolveCleaningTypeMultiplier(cleaningType);
  measurements.dustMultiplier = resolveDustMultiplier(diagnostic?.afterRepairDustLevel);
  measurements.totalCleaningMultiplier = resolveCombinedCleaningMultiplier(
    cleaningType,
    diagnostic?.afterRepairDustLevel,
    furniturePresent,
  );

  measurements.cleanAreaLabor = round2(cleanArea * measurements.totalCleaningMultiplier);
  measurements.standardCleanAreaLabor =
    String(cleaningType).toLowerCase().replace(/-/g, '_') !== 'post_construction'
      ? measurements.cleanAreaLabor
      : 0;
  measurements.postConstructionAreaLabor =
    String(cleaningType).toLowerCase().replace(/-/g, '_') === 'post_construction'
      ? measurements.cleanAreaLabor
      : 0;

  measurements.chemistryUnits = Math.ceil(cleanArea / 40);
  measurements.trashRemovalUnits = readBoolean(diagnostic, 'trashRemoval')
    ? Math.ceil(cleanArea / 50)
    : 0;

  measurements.inspectionHours = Math.max(1, Math.ceil(cleanArea / 80));
  measurements.dryCleanAreaLabor = round2(cleanArea * 0.4 * measurements.totalCleaningMultiplier);
  measurements.wetCleanAreaLabor = measurements.cleanAreaLabor;
  measurements.bathroomCleanUnits = measurements.bathroomCount;
  measurements.specialCleanAreaLabor =
    measurements.postConstructionAreaLabor > 0 ? measurements.postConstructionAreaLabor : 0;

  return measurements;
}
