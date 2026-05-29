import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';
import {
  type CompanyPricingModifiers,
  resolvePricingModifierFactor,
} from '../../../../../../prisma/estimate-pricing-modifiers';

function normalizeRoofType(roofType: unknown): string {
  return String(roofType ?? 'metal')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function normalizeGridConnection(gridConnection: unknown): string {
  return String(gridConnection ?? 'on_grid')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

export function resolveRoofMultiplier(
  roofType: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = normalizeRoofType(roofType);
  if (normalized === 'tile') return resolvePricingModifierFactor('solar.roofType.tile', overrides);
  if (normalized === 'flat') return resolvePricingModifierFactor('solar.roofType.flat', overrides);
  if (normalized === 'ground') return resolvePricingModifierFactor('solar.roofType.ground', overrides);
  return 1.0;
}

export function shouldRequireSolarManualReview(panelCount: number, systemPowerKw: number): boolean {
  return panelCount > 30 || systemPowerKw > 15;
}

export function derivePanouriSolareMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
  overrides?: CompanyPricingModifiers | null,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };
  const pointsCount = (type: string) => plan2d?.points?.filter((point) => point.type === type).length ?? 0;

  const planPanelCount = pointsCount('solar_panel');
  const panelCount = Math.min(
    100,
    Math.max(
      1,
      readNumber(diagnostic, 'panelCount') ??
        (planPanelCount > 0 ? planPanelCount : measurements.panelCount ?? 1),
    ),
  );
  measurements.panelCount = panelCount;

  const planInverterCount = pointsCount('inverter');
  const diagnosticInverterCount = readNumber(diagnostic, 'inverterCount');
  measurements.inverterCount =
    diagnosticInverterCount ??
    (planInverterCount > 0 ? planInverterCount : 1);

  measurements.batteryCapacity = Math.max(0, readNumber(diagnostic, 'batteryCapacity') ?? 0);

  const panelWp = readNumber(diagnostic, 'panelWp');
  const manualSystemPowerKw = readNumber(diagnostic, 'systemPowerKw');
  if (manualSystemPowerKw != null && manualSystemPowerKw > 0) {
    measurements.systemPowerKw = round2(manualSystemPowerKw);
  } else if (panelWp != null && panelWp > 0) {
    measurements.systemPowerKw = round2((panelCount * panelWp) / 1000);
  } else {
    measurements.systemPowerKw = 0;
  }

  const roofMultiplier = resolveRoofMultiplier(diagnostic?.roofType, overrides);
  measurements.roofMultiplier = roofMultiplier;
  measurements.structureQty = panelCount;
  measurements.structureLaborQty = round2(panelCount * roofMultiplier);
  measurements.panelLaborQty = round2(panelCount * roofMultiplier);
  measurements.optimizerCount = panelCount;
  measurements.evChargerCount = Math.max(0, readNumber(diagnostic, 'evChargerCount') ?? 0);

  const manualCableLengthM = readNumber(diagnostic, 'cableLengthM');
  measurements.cableLengthM =
    manualCableLengthM != null && manualCableLengthM > 0
      ? manualCableLengthM
      : round2(panelCount * 2.5);

  measurements.permitUnits = readBoolean(diagnostic, 'permitsRequired') ? 1 : 0;
  measurements.monitoringUnits = readBoolean(diagnostic, 'monitoringRequired') ? 1 : 0;

  const gridConnection = normalizeGridConnection(diagnostic?.gridConnection);
  measurements.gridConnectionUnits =
    gridConnection === 'off_grid' ? 0 : 1;

  measurements.auditHours = 4;
  measurements.projectHours = 8;
  measurements.protectionPanelUnits = Math.max(1, Math.ceil(panelCount / 12));
  measurements.groundingUnits = 1;
  measurements.handoverUnits = 1;
  measurements.projectUnits = 1;

  measurements.requiresManualReview = shouldRequireSolarManualReview(
    panelCount,
    measurements.systemPowerKw,
  )
    ? 1
    : 0;

  return measurements;
}
