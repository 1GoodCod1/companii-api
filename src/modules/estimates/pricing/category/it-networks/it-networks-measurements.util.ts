import type { Plan2dData } from '../../plan2d.types';
import { readNumber, readBoolean, type MeasurementMap } from '../category-shared.util';

export function deriveItNetworksMeasurements(
  _plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };

  measurements.networkPoints = readNumber(diagnostic, 'networkPoints') ?? 0;
  measurements.cameraCount = readNumber(diagnostic, 'cameraCount') ?? 0;
  measurements.apCount = readNumber(diagnostic, 'apCount') ?? 0;
  measurements.rackUnits = readNumber(diagnostic, 'rackUnits') ?? 0;

  measurements.serversToConfigure = readNumber(diagnostic, 'serversToConfigure') ?? 0;
  measurements.serversToAssemble = readNumber(diagnostic, 'serversToAssemble') ?? 0;
  measurements.workstationsToConfigure = readNumber(diagnostic, 'workstationsToConfigure') ?? 0;
  measurements.workstationsToAssemble = readNumber(diagnostic, 'workstationsToAssemble') ?? 0;

  const avgCableLength = readNumber(diagnostic, 'avgCableLengthPerPort') ?? 20;
  measurements.networkCableM = measurements.networkPoints * avgCableLength;

  measurements.analysisHours = readBoolean(diagnostic, 'siteSurveyRequired') ? 8 : 0;
  measurements.testingHours = readBoolean(diagnostic, 'commissioningRequired') ? 8 : 0;
  measurements.trainingHours = readBoolean(diagnostic, 'documentationRequired') ? 4 : 0;

  measurements.slaUnits = readBoolean(diagnostic, 'slaRequired') ? 1 : 0;
  measurements.migrationUnits = readBoolean(diagnostic, 'migrationRequired') ? 1 : 0;
  measurements.projectUnits = 1;

  measurements.planWizardEnabled = 1; // Always enabled for physical networks
  measurements.requiresManualReview = (measurements.networkPoints > 100 || measurements.serversToConfigure > 5) ? 1 : 0;

  return measurements;
}
