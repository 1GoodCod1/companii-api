import type { Plan2dData } from '../plan2d.types';
import type { CompanyPricingModifiers } from '../../../../../prisma/estimate-pricing-modifiers';

export type MeasurementMap = Record<string, number>;

export function readNumber(
  source: Record<string, unknown> | null | undefined,
  key: string,
): number | undefined {
  const value = source?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function readBoolean(
  source: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  const value = source?.[key];
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return false;
}

export interface CategoryMeasurementStrategy {
  readonly slug: string;
  deriveMeasurements(
    plan2d: Plan2dData | null | undefined,
    diagnostic: Record<string, unknown> | null | undefined,
    base: MeasurementMap,
    pricingModifiers?: CompanyPricingModifiers | null,
  ): MeasurementMap;
}
