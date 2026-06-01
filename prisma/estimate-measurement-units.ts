/**
 * Допустимые единицы измерения для смет (задача A-04).
 * Синхронизировать с companii-web/src/constants/estimateMeasurementUnits.constants.ts
 */
export const ESTIMATE_MEASUREMENT_UNITS = [
  'm²',
  'm³',
  'm',
  'buc',
  'kg',
  'ore',
  'grade',
  'kWh',
] as const;

export type EstimateMeasurementUnit = (typeof ESTIMATE_MEASUREMENT_UNITS)[number];

export const DEFAULT_LABOR_UNITS: readonly EstimateMeasurementUnit[] = ['m²', 'm', 'buc', 'ore'];

type LaborUnitsConfig = { laborUnits?: readonly EstimateMeasurementUnit[] } | null | undefined;

export function resolveLaborUnits(config: LaborUnitsConfig): readonly EstimateMeasurementUnit[] {
  const configured = config?.laborUnits;
  if (configured?.length) return configured;
  return DEFAULT_LABOR_UNITS;
}

const UNIT_ALIASES: Record<string, EstimateMeasurementUnit> = {
  m2: 'm²',
  'm²': 'm²',
  m3: 'm³',
  'm³': 'm³',
  m: 'm',
  buc: 'buc',
  bucat: 'buc',
  bucata: 'buc',
  bucati: 'buc',
  bucăți: 'buc',
  kg: 'kg',
  kilogram: 'kg',
  kilograme: 'kg',
  ore: 'ore',
  h: 'ore',
  hr: 'ore',
  hours: 'ore',
  hour: 'ore',
  grade: 'grade',
  deg: 'grade',
  degrees: 'grade',
  kwh: 'kWh',
  kWh: 'kWh',
};

export function normalizeEstimateUnit(raw: string): EstimateMeasurementUnit | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase() === 'kwh' ? 'kwh' : trimmed.toLowerCase();
  const normalized = UNIT_ALIASES[key] ?? UNIT_ALIASES[trimmed];
  if (normalized) return normalized;
  return (ESTIMATE_MEASUREMENT_UNITS as readonly string[]).includes(trimmed)
    ? (trimmed as EstimateMeasurementUnit)
    : null;
}

export function isEstimateMeasurementUnit(value: string): value is EstimateMeasurementUnit {
  return normalizeEstimateUnit(value) !== null;
}

export function formatEstimateUnitsList(): string {
  return ESTIMATE_MEASUREMENT_UNITS.join(', ');
}
