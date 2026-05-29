import type { Plan2dData } from '../../plan2d.types';
import { readNumber, type MeasurementMap } from '../category-shared.util';

function normalizeRepairComplexity(
  repairComplexity: unknown,
): 'simple' | 'medium' | 'complex' {
  const normalized = String(repairComplexity ?? '').trim().toLowerCase();
  if (normalized.includes('simpl')) return 'simple';
  if (normalized.includes('medi')) return 'medium';
  if (normalized.includes('complex')) return 'complex';
  return 'simple';
}

function normalizeRecoverySeverity(
  severity: unknown,
): 'logic' | 'physical' | 'severe' {
  const normalized = String(severity ?? '').trim().toLowerCase();
  if (normalized.includes('logic') || normalized.includes('sterg') || normalized.includes('șterg')) {
    return 'logic';
  }
  if (normalized.includes('usoar') || normalized.includes('ușoar')) return 'physical';
  if (normalized.includes('grav')) return 'severe';
  return 'logic';
}

export function deriveItHardwareMeasurements(
  _plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };

  measurements.deviceCount = readNumber(diagnostic, 'deviceCount') ?? 1;
  measurements.repairCount = readNumber(diagnostic, 'repairCount') ?? 0;
  measurements.assemblyCount = readNumber(diagnostic, 'assemblyCount') ?? 0;
  measurements.upgradeCount = readNumber(diagnostic, 'upgradeCount') ?? 0;
  measurements.cleaningHwCount = readNumber(diagnostic, 'cleaningHwCount') ?? 0;
  measurements.osInstallCount = readNumber(diagnostic, 'osInstallCount') ?? 0;
  measurements.dataRecoveryCount = readNumber(diagnostic, 'dataRecoveryCount') ?? 0;
  measurements.peripheralCount = readNumber(diagnostic, 'peripheralCount') ?? 0;

  const repairComplexity = normalizeRepairComplexity(diagnostic?.repairComplexity);
  measurements.simpleRepairCount = repairComplexity === 'simple' ? measurements.repairCount : 0;
  measurements.mediumRepairCount = repairComplexity === 'medium' ? measurements.repairCount : 0;
  measurements.complexRepairCount = repairComplexity === 'complex' ? measurements.repairCount : 0;
  measurements.osLicenseCount = measurements.osInstallCount;

  const recoverySeverity = normalizeRecoverySeverity(diagnostic?.recoverySeverity);
  measurements.logicRecoveryCount = recoverySeverity === 'logic' ? measurements.dataRecoveryCount : 0;
  measurements.physicalRecoveryCount = recoverySeverity === 'physical' ? measurements.dataRecoveryCount : 0;
  measurements.severeRecoveryCount = recoverySeverity === 'severe' ? measurements.dataRecoveryCount : 0;
  measurements.projectUnits = 1;

  return measurements;
}