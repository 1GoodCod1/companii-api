import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';


function readSelect(source: Record<string, unknown> | null | undefined, key: string): string {
  const value = source?.[key];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return '';
}

export function resolveWallMaterialMultiplier(wallMaterial: unknown): number {
  const normalized = String(wallMaterial ?? 'gips')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized === 'beton' || normalized === 'concrete') return 1.45;
  if (normalized === 'caramida' || normalized === 'brick') return 1.2;
  if (normalized === 'bca' || normalized === 'aac') return 1.1;
  return 1.0;
}

function resolveCableSegmentMultiplier(segment: string): number {
  if (segment === '4 mm²') return 1.4;
  if (segment === '6 mm²') return 1.7;
  return 1.0; 
}

function resolveDeviceTierMultiplier(tier: string): number {
  if (tier === 'premium') return 2.5;
  if (tier === 'standard') return 1.5;
  return 1.0;
}

export function deriveElektrikaMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
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
  const wallChasingM = readNumber(diagnostic, 'wallChasingM') ?? 0;
  const panelModules = readNumber(diagnostic, 'panelModules') ?? 12;

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
  measurements.panelModules = panelModules;
  measurements.dedicatedLinesCount = dedicatedLinesCount;

  measurements.cableLengthM =
    Math.max(15, roomCount * 12) +
    (cableReplace ? 25 : 0) +
    dedicatedLinesCount * 12;

  const cableSegmentMultiplier = resolveCableSegmentMultiplier(readSelect(diagnostic, 'cableSegmentMm2') || '2.5 mm²');
  measurements.cableSegmentMultiplier = cableSegmentMultiplier;
  const deviceTierMultiplier = resolveDeviceTierMultiplier(readSelect(diagnostic, 'deviceTier') || 'standard');
  measurements.deviceTierMultiplier = deviceTierMultiplier;

  measurements.wallChasingM = wallChasingM > 0 ? wallChasingM : 0;
  const materialMultiplier = resolveWallMaterialMultiplier(diagnostic?.wallMaterial);
  measurements.materialMultiplier = materialMultiplier;
  measurements.wallChasingCostM = isNewConstruction ? 0 : round2(measurements.wallChasingM * materialMultiplier);
  measurements.cableLengthMLabor = round2(measurements.cableLengthM);
  measurements.electricPointsLabor = round2(measurements.electricPoints);

  measurements.smartHomeCount = smartHomeRequired ? 1 : 0;
  measurements.lowVoltageLineCount = dedicatedLinesCount;
  measurements.groundingUnits = groundingRequired ? 1 : 0;
  measurements.stabilizerCount = voltageStabilizer ? 1 : 0;
  measurements.demolitionHours = cableReplace ? Math.max(2, roomCount) : 0;
  measurements.projectHours = Math.max(2, Math.ceil(roomCount / 2));
  measurements.testingPointCount = measurements.electricPoints;
  measurements.electricPointsMaterial = round2(measurements.electricPoints * deviceTierMultiplier);
  measurements.cableMaterialM = round2(measurements.cableLengthM * cableSegmentMultiplier);

  return measurements;
}
