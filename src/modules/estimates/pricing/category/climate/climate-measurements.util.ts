import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';

export type MeasurementMap = Record<string, number>;

/** Metri incluși în prețul standard al traseului (peste această valoare — linie separată). */
export const CLIMATE_ROUTE_INCLUDED_M = 5;

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

export function resolveClimateHeightMultiplier(heightWork: unknown): number {
  return readBoolean({ heightWork }, 'heightWork') ? 1.25 : 1.0;
}

/**
 * Category-specific measurements for `clima` (implementation_plan.md §4.3).
 */
export function deriveClimaMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };
  const pointsCount = (type: string) => plan2d?.points?.filter((point) => point.type === type).length ?? 0;

  const planIndoorCount = pointsCount('indoor');
  const planOutdoorCount = pointsCount('outdoor');
  const planRouteCount = pointsCount('route');

  const manualIndoor = readNumber(diagnostic, 'indoorUnitCount');
  const manualOutdoor = readNumber(diagnostic, 'outdoorUnitCount');
  const manualAcUnits = readNumber(diagnostic, 'acUnits');

  const indoorUnitCount = manualIndoor ?? (planIndoorCount > 0 ? planIndoorCount : undefined);
  const acUnits = Math.max(
    1,
    Math.min(20, indoorUnitCount ?? manualAcUnits ?? (planIndoorCount > 0 ? planIndoorCount : 1)),
  );

  measurements.acUnits = acUnits;
  measurements.indoorUnitCount = indoorUnitCount ?? acUnits;
  measurements.outdoorUnitCount = manualOutdoor ?? (planOutdoorCount > 0 ? planOutdoorCount : acUnits);

  const manualRouteLength = readNumber(diagnostic, 'routeLengthM');
  measurements.routeLengthM =
    manualRouteLength ??
    Math.max(2, planRouteCount > 0 ? planRouteCount * 5 : acUnits * 5);

  const manualDrainLength = readNumber(diagnostic, 'drainLengthM');
  measurements.drainLengthM = manualDrainLength ?? measurements.routeLengthM;

  const wallCoreDrillingCount = readNumber(diagnostic, 'wallCoreDrillingCount');
  measurements.coreDrillingQty = wallCoreDrillingCount ?? acUnits;

  measurements.routeStandardLengthM = Math.min(measurements.routeLengthM, CLIMATE_ROUTE_INCLUDED_M);
  measurements.routeExtraLengthM = Math.max(0, measurements.routeLengthM - CLIMATE_ROUTE_INCLUDED_M);
  measurements.freonRechargeQty =
    measurements.routeExtraLengthM > 0 ? Math.ceil(measurements.routeExtraLengthM / 5) : 0;

  const heightWork = readBoolean(diagnostic, 'heightWork');
  const requiresPump = readBoolean(diagnostic, 'requiresPump');
  const equipmentIncluded = readBoolean(diagnostic, 'equipmentIncluded');
  const maintenancePackage = readBoolean(diagnostic, 'maintenancePackage');

  measurements.heightMultiplier = resolveClimateHeightMultiplier(heightWork);
  measurements.pumpCount = requiresPump ? acUnits : 0;
  measurements.maintenanceCount = maintenancePackage ? acUnits : 0;
  measurements.indoorEquipmentCount = equipmentIncluded ? measurements.indoorUnitCount : 0;
  measurements.outdoorEquipmentCount = equipmentIncluded ? measurements.outdoorUnitCount : 0;
  measurements.heightSurchargeUnits = heightWork ? acUnits : 0;

  measurements.acUnitsLabor = round2(acUnits * measurements.heightMultiplier);
  measurements.routeStandardLengthMLabor = round2(measurements.routeStandardLengthM * measurements.heightMultiplier);
  measurements.routeExtraLengthMLabor = round2(measurements.routeExtraLengthM * measurements.heightMultiplier);
  measurements.drainLengthMLabor = round2(measurements.drainLengthM * measurements.heightMultiplier);
  measurements.inspectionHours = Math.max(1, Math.ceil(acUnits / 2));

  return measurements;
}
