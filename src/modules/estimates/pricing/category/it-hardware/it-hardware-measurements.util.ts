import type { Plan2dData } from '../../plan2d.types';
import { readNumber, type MeasurementMap } from '../category-shared.util';

export function deriveItHardwareMeasurements(
  _plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };

  measurements.deviceCount = readNumber(diagnostic, 'deviceCount') ?? 1;

  measurements.simpleRepairCount = readNumber(diagnostic, 'simpleRepairCount') ?? 0;
  measurements.mediumRepairCount = readNumber(diagnostic, 'mediumRepairCount') ?? 0;
  measurements.complexRepairCount = readNumber(diagnostic, 'complexRepairCount') ?? 0;
  measurements.repairCount = measurements.simpleRepairCount + measurements.mediumRepairCount + measurements.complexRepairCount;

  measurements.assemblyCount = readNumber(diagnostic, 'assemblyCount') ?? 0;
  measurements.upgradeCount = readNumber(diagnostic, 'upgradeCount') ?? 0;
  measurements.cleaningHwCount = readNumber(diagnostic, 'cleaningHwCount') ?? 0;
  measurements.osInstallCount = readNumber(diagnostic, 'osInstallCount') ?? 0;

  const osTypeStr = String(diagnostic?.osType ?? '').toLowerCase();
  const isFreeOs = osTypeStr.includes('linux') || osTypeStr.includes('macos');
  measurements.osLicenseCount = isFreeOs ? 0 : measurements.osInstallCount;

  measurements.logicRecoveryCount = readNumber(diagnostic, 'logicRecoveryCount') ?? 0;
  measurements.physicalRecoveryCount = readNumber(diagnostic, 'physicalRecoveryCount') ?? 0;
  measurements.severeRecoveryCount = readNumber(diagnostic, 'severeRecoveryCount') ?? 0;
  measurements.dataRecoveryCount = measurements.logicRecoveryCount + measurements.physicalRecoveryCount + measurements.severeRecoveryCount;

  measurements.peripheralCount = readNumber(diagnostic, 'peripheralCount') ?? 0;
  measurements.projectUnits = 1;

  return measurements;
}