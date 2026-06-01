import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';
import {
  type CompanyPricingModifiers,
  resolvePricingModifierFactor,
} from '../../../../../../prisma/estimate-pricing-modifiers';


function readSelect(source: Record<string, unknown> | null | undefined, key: string): string {
  const value = source?.[key];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return '';
}

export function resolveWallMaterialMultiplier(
  wallMaterial: unknown,
  overrides?: CompanyPricingModifiers | null,
): number {
  const normalized = String(wallMaterial ?? 'gips')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'beton' || normalized === 'concrete') return resolvePricingModifierFactor('elektrika.wallMaterial.beton', overrides);
  if (normalized === 'caramida' || normalized === 'brick') return resolvePricingModifierFactor('elektrika.wallMaterial.caramida', overrides);
  if (normalized === 'bca' || normalized === 'aac') return resolvePricingModifierFactor('elektrika.wallMaterial.bca', overrides);
  return 1.0;
}

function resolveCableSegmentMultiplier(segment: string, overrides?: CompanyPricingModifiers | null): number {
  if (segment === '4 mm²') return resolvePricingModifierFactor('elektrika.cableSegment.4', overrides);
  if (segment === '6 mm²') return resolvePricingModifierFactor('elektrika.cableSegment.6', overrides);
  return 1.0;
}

function resolveDeviceTierMultiplier(tier: string, overrides?: CompanyPricingModifiers | null): number {
  if (tier === 'premium') return resolvePricingModifierFactor('elektrika.deviceTier.premium', overrides);
  if (tier === 'standard') return resolvePricingModifierFactor('elektrika.deviceTier.standard', overrides);
  return 1.0;
}

function estimateWallChasingM(cableLengthM: number, electricPoints: number): number {
  return round2(Math.max(10, cableLengthM * 0.25 + electricPoints * 1.2));
}

export function deriveElektrikaMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
  overrides?: CompanyPricingModifiers | null,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };
  const pointsCount = (type: string) => plan2d?.points?.filter((point) => point.type === type).length ?? 0;

  const roomCount = Math.max(
    1,
    readNumber(diagnostic, 'roomCount') ?? readNumber(measurements, 'roomCount') ?? 1,
  );
  const cableReplace = readBoolean(diagnostic, 'cableReplace');
  const newPanel = readBoolean(diagnostic, 'newPanel');
  const smartHomeRequired = readBoolean(diagnostic, 'smartHomeRequired');
  const groundingRequired = readBoolean(diagnostic, 'groundingRequired');
  const voltageStabilizer = readBoolean(diagnostic, 'voltageStabilizer');
  const isNewConstruction = readBoolean(diagnostic, 'isNewConstruction');
  const dedicatedLinesCount = readNumber(diagnostic, 'dedicatedLinesCount') ?? 0;
  const manualWallChasingM = readNumber(diagnostic, 'wallChasingM');
  const panelModulesInput = readNumber(diagnostic, 'panelModules') ?? 12;

  measurements.roomCount = roomCount;

  const planSocketCount = pointsCount('socket');
  const planSwitchCount = pointsCount('switch');
  const planLightCount = pointsCount('light');
  const manualSocketCount = readNumber(diagnostic, 'socketCount');
  const manualSwitchCount = readNumber(diagnostic, 'switchCount');
  const manualLightCount = readNumber(diagnostic, 'lightPointCount');

  measurements.socketCount =
    manualSocketCount ?? (planSocketCount > 0 ? planSocketCount : Math.max(0, roomCount * 2));
  measurements.switchCount =
    manualSwitchCount ?? (planSwitchCount > 0 ? planSwitchCount : Math.max(0, roomCount));
  measurements.lightPointCount =
    manualLightCount ?? (planLightCount > 0 ? planLightCount : Math.max(0, roomCount));

  measurements.electricPoints =
    measurements.socketCount + measurements.switchCount + measurements.lightPointCount;

  const planPanelCount = pointsCount('panel');
  measurements.panelCount = planPanelCount + (newPanel ? 1 : 0);
  measurements.panelModules = measurements.panelCount > 0 ? panelModulesInput : 0;
  measurements.dedicatedLinesCount = dedicatedLinesCount;

  measurements.cableLengthM =
    Math.max(15, roomCount * 12) +
    (cableReplace ? 25 : 0) +
    dedicatedLinesCount * 12;

  const cableSegmentMultiplier = resolveCableSegmentMultiplier(readSelect(diagnostic, 'cableSegmentMm2') || '2.5 mm²', overrides);
  measurements.cableSegmentMultiplier = cableSegmentMultiplier;
  const deviceTierMultiplier = resolveDeviceTierMultiplier(readSelect(diagnostic, 'deviceTier') || 'standard', overrides);
  measurements.deviceTierMultiplier = deviceTierMultiplier;

  if (isNewConstruction) {
    measurements.wallChasingM = 0;
  } else if (manualWallChasingM !== undefined) {
    measurements.wallChasingM = manualWallChasingM > 0 ? manualWallChasingM : 0;
  } else {
    measurements.wallChasingM = estimateWallChasingM(measurements.cableLengthM, measurements.electricPoints);
  }

  const materialMultiplier = resolveWallMaterialMultiplier(diagnostic?.wallMaterial, overrides);
  measurements.materialMultiplier = materialMultiplier;
  measurements.wallChasingCostM = round2(measurements.wallChasingM * materialMultiplier);
  measurements.cableLengthMLabor = round2(measurements.cableLengthM);

  measurements.smartHomeCount = smartHomeRequired ? 1 : 0;
  measurements.lowVoltageLineCount = dedicatedLinesCount;
  measurements.groundingUnits = groundingRequired ? 1 : 0;
  measurements.stabilizerCount = voltageStabilizer ? 1 : 0;
  measurements.demolitionHours = cableReplace ? Math.max(2, roomCount) : 0;
  measurements.projectHours = Math.max(2, Math.ceil(roomCount / 2));
  measurements.testingHours = measurements.electricPoints > 0 ? 0 : 2;
  measurements.cableMaterialM = round2(measurements.cableLengthM * cableSegmentMultiplier);

  return measurements;
}
