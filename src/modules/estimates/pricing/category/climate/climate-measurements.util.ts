import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';
import {
  type CompanyPricingModifiers,
  resolvePricingModifierFactor,
} from '../../../../../../prisma/estimate-pricing-modifiers';

export const CLIMATE_ROUTE_INCLUDED_M = 5;


export function resolveClimateHeightMultiplier(
  heightWork: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  return readBoolean({ heightWork }, 'heightWork')
    ? resolvePricingModifierFactor('clima.heightWork', overrides)
    : 1.0;
}

export function deriveClimaMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
  overrides?: CompanyPricingModifiers | null,
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

  measurements.heightMultiplier = resolveClimateHeightMultiplier(heightWork, overrides);
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
