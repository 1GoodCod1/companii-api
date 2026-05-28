import type { Plan2dData } from '../../plan2d.types';

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

function normalizeScope(projectScope: unknown): 'small' | 'medium' | 'enterprise' {
  const normalized = String(projectScope ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  if (normalized.includes('enterprise') || normalized.includes('20+')) return 'enterprise';
  if (normalized.includes('mediu') || normalized.includes('medium') || normalized.includes('6-20')) {
    return 'medium';
  }
  return 'small';
}

function normalizeItDirection(itDirection: unknown): string {
  return String(itDirection ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Plan wizard step only for physical network projects (implementation_plan.md §4.10). */
export function shouldEnablePlanWizardForItNetworks(itDirection: unknown): boolean {
  const normalized = normalizeItDirection(itDirection);
  return (
    normalized === 'network' ||
    normalized.includes('retea') ||
    normalized.includes('rețea') ||
    normalized.includes('cablare') ||
    normalized.includes('cablu')
  );
}

export function shouldRequireItManualReview(projectScope: unknown): boolean {
  return normalizeScope(projectScope) === 'enterprise';
}

export function resolveAnalysisHours(projectScope: unknown): number {
  const scope = normalizeScope(projectScope);
  if (scope === 'enterprise') return 32;
  if (scope === 'medium') return 16;
  return 8;
}

/**
 * Category-specific measurements for `it-networks` (implementation_plan.md §4.10).
 */
export function deriveItNetworksMeasurements(
  _plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  base: MeasurementMap,
): MeasurementMap {
  const measurements: MeasurementMap = { ...base };

  const pagesCount = readNumber(diagnostic, 'pagesCount') ?? 0;
  measurements.pagesCount = pagesCount;
  measurements.networkPoints = readNumber(diagnostic, 'networkPoints') ?? 0;
  measurements.cameraCount = readNumber(diagnostic, 'cameraCount') ?? 0;
  measurements.apCount = readNumber(diagnostic, 'apCount') ?? 0;
  measurements.serverCount = readNumber(diagnostic, 'serverCount') ?? 0;
  measurements.workstationCount = readNumber(diagnostic, 'workstationCount') ?? 0;
  measurements.rackUnits = readNumber(diagnostic, 'rackUnits') ?? 0;

  measurements.networkCableM = measurements.networkPoints * 20;
  measurements.hasBackendCount = readBoolean(diagnostic, 'hasBackend') ? 1 : 0;
  measurements.hasCmsCount = readBoolean(diagnostic, 'hasCMS') ? 1 : 0;
  measurements.hasEcommerceCount = readBoolean(diagnostic, 'hasEcommerce') ? 1 : 0;

  measurements.analysisHours = resolveAnalysisHours(diagnostic?.projectScope);
  measurements.testingHours = Math.max(8, Math.ceil(pagesCount * 0.5));
  measurements.trainingHours = readBoolean(diagnostic, 'documentationRequired') ? 6 : 2;
  measurements.slaUnits = readBoolean(diagnostic, 'slaRequired') ? 1 : 0;
  measurements.migrationUnits = readBoolean(diagnostic, 'migrationRequired') ? 1 : 0;
  measurements.projectUnits = 1;

  measurements.planWizardEnabled = shouldEnablePlanWizardForItNetworks(diagnostic?.itDirection) ? 1 : 0;
  measurements.requiresManualReview = shouldRequireItManualReview(diagnostic?.projectScope) ? 1 : 0;

  measurements.designPageCount = pagesCount;
  measurements.frontendPageCount = pagesCount;

  return measurements;
}
