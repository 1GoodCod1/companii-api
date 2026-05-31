import type { Plan2dData } from '../pricing/plan2d.types';
import { guessUnit, round2 } from '../estimate.constants';
import type { MeasurementMap } from '../pricing/pricing-engine.service';

export type MeasurementSource = 'plan' | 'diagnostic' | 'fallback' | 'manual' | 'computed';

export type CalculationTraceEntry = {
  key: string;
  value: number;
  unit: string;
  source: MeasurementSource;
};

export const INTERNAL_MEASUREMENT_KEYS = new Set<string>([
  'requiresManualReview',
  'requiresInteractiveDrawing',
  'roofGeometryComplexityScore',
  'preliminaryEstimate',
]);

export function collectPlanMeasurementKeys(plan2d: Plan2dData | null | undefined): Set<string> {
  const keys = new Set<string>();
  const globalParams = plan2d?.globalParameters;

  if (globalParams) {
    if (typeof globalParams.baseArea === 'number' && Number.isFinite(globalParams.baseArea)) {
      keys.add('baseArea');
    }
    if (typeof globalParams.wallHeight === 'number' && Number.isFinite(globalParams.wallHeight)) {
      keys.add('wallHeight');
    }
    if (typeof globalParams.floorsCount === 'number' && Number.isFinite(globalParams.floorsCount)) {
      keys.add('storyCount');
    }
    if (typeof globalParams.roofSlope === 'number' && Number.isFinite(globalParams.roofSlope)) {
      keys.add('roofSlope');
    }
    if (typeof globalParams.facadeArea === 'number' && Number.isFinite(globalParams.facadeArea)) {
      keys.add('facadeArea');
      keys.add('scaffoldingArea');
    }
  }

  if (plan2d?.rooms?.length) {
    keys.add('totalFloorArea');
    keys.add('roomCount');
  }

  if (plan2d?.points?.length) {
    keys.add('plumbingPoints');
    keys.add('electricPoints');
    keys.add('panelCount');
    keys.add('acUnits');
    keys.add('networkPoints');
    keys.add('apCount');
    keys.add('cameraCount');
    keys.add('rackCount');
    keys.add('inverterCount');
    keys.add('batteryCount');
    keys.add('windowCount');
    keys.add('doorCount');
    keys.add('cabinetCount');
    keys.add('wardrobeCount');
  }

  return keys;
}

export function collectDiagnosticNumericKeys(
  diagnostic: Record<string, unknown> | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!diagnostic) return keys;

  for (const [key, value] of Object.entries(diagnostic)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      keys.add(key);
    }
  }

  return keys;
}

export function isBaseWallAreaFallback(
  measurements: MeasurementMap,
  diagnosticKeys: Set<string>,
  planKeys: Set<string>,
): boolean {
  const totalFloorArea = measurements.totalFloorArea;
  const wallArea = measurements.wallArea;
  if (totalFloorArea == null || wallArea == null) return false;
  if (diagnosticKeys.has('wallArea') || planKeys.has('wallArea')) return false;
  return wallArea === round2(totalFloorArea * 2.5);
}

export function resolveMeasurementSource(
  key: string,
  measurements: MeasurementMap,
  planKeys: Set<string>,
  diagnosticKeys: Set<string>,
): MeasurementSource {
  if (diagnosticKeys.has(key)) return 'diagnostic';
  if (planKeys.has(key)) return 'plan';
  if (key === 'wallArea' && isBaseWallAreaFallback(measurements, diagnosticKeys, planKeys)) {
    return 'fallback';
  }
  return 'computed';
}

export function filterPersistableMeasurements(measurements: MeasurementMap): MeasurementMap {
  const result: MeasurementMap = {};
  for (const [key, value] of Object.entries(measurements)) {
    if (INTERNAL_MEASUREMENT_KEYS.has(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    result[key] = value;
  }
  return result;
}

export function resolveRequiresManualReview(measurements: MeasurementMap): boolean {
  return (measurements.requiresManualReview ?? 0) > 0;
}

export function buildCalculationTrace(
  measurements: MeasurementMap,
  plan2d: Plan2dData | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
): CalculationTraceEntry[] {
  const planKeys = collectPlanMeasurementKeys(plan2d);
  const diagnosticKeys = collectDiagnosticNumericKeys(diagnostic);
  const entries: CalculationTraceEntry[] = [];

  for (const [key, value] of Object.entries(measurements)) {
    if (INTERNAL_MEASUREMENT_KEYS.has(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;

    entries.push({
      key,
      value,
      unit: guessUnit(key),
      source: resolveMeasurementSource(key, measurements, planKeys, diagnosticKeys),
    });
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}
