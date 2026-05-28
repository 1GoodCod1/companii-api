import type { Plan2dData } from '../../plan2d.types';
import { round2 } from '../../../estimate.constants';

export type MeasurementMap = Record<string, number>;

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

/** implementation_plan.md §4.7 */
export function resolveInstallationMultiplier(installationType: unknown): number {
  const normalized = String(installationType ?? 'standard')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');

  if (normalized === 'warm-installation' || normalized === 'warm') return 1.35;
  if (normalized === 'renovation') return 1.2;
  return 1.0;
}

/**
 * Category-specific measurements for `okna-dveri` (implementation_plan.md §4.7).
 */
export function deriveOknaDveriMeasurements(
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };
  const pointsCount = (type: string) => plan2d?.points?.filter((point) => point.type === type).length ?? 0;

  const planWindowCount = pointsCount('window');
  const planDoorCount = pointsCount('door') + pointsCount('sliding_door');

  measurements.windowCount = Math.max(
    0,
    readNumber(diagnostic, 'windowCount') ?? (planWindowCount > 0 ? planWindowCount : 0),
  );
  measurements.doorCount = Math.max(
    0,
    readNumber(diagnostic, 'doorCount') ?? (planDoorCount > 0 ? planDoorCount : 0),
  );

  measurements.windowAreaM2 = readNumber(diagnostic, 'windowAreaM2') ?? 0;
  measurements.doorAreaM2 = readNumber(diagnostic, 'doorAreaM2') ?? 0;

  const openingCount = measurements.windowCount + measurements.doorCount;
  measurements.foamTubes = Math.ceil(openingCount * 0.7);

  const sillCount = readNumber(diagnostic, 'sillCount') ?? measurements.windowCount;
  measurements.sillCount = sillCount;
  measurements.sillLengthM = round2(sillCount * 1.2);

  measurements.mosquitoNetCount = readNumber(diagnostic, 'mosquitoNetCount') ?? 0;

  const installationMultiplier = resolveInstallationMultiplier(diagnostic?.installationType);
  measurements.installationMultiplier = installationMultiplier;
  measurements.windowCountLabor = round2(measurements.windowCount * installationMultiplier);
  measurements.doorCountLabor = round2(measurements.doorCount * installationMultiplier);

  const oldFrameRemoval = readBoolean(diagnostic, 'oldFrameRemoval');
  measurements.oldRemovalQty = oldFrameRemoval ? openingCount : 0;
  measurements.disposalQty = measurements.oldRemovalQty;

  const installationType = String(diagnostic?.installationType ?? 'standard').toLowerCase();
  measurements.warmInstallationUnits =
    installationType === 'warm_installation' || installationType === 'warm-installation'
      ? openingCount
      : 0;

  measurements.measurementUnits = openingCount > 0 ? 1 : 0;
  measurements.slopesLengthM = measurements.sillLengthM;
  measurements.regulationUnits = openingCount;

  return measurements;
}
