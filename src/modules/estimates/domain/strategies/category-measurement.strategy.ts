import type { Plan2dData } from '../../pricing/plan2d.types';

export interface CategoryMeasurementStrategy {
  readonly slug: string;
  deriveMeasurements(
    plan2d: Plan2dData | null,
    diagnostic: Record<string, unknown>,
    pricingModifiers?: Record<string, unknown> | null,
  ): Record<string, number>;
}

export const CATEGORY_MEASUREMENT_STRATEGY = Symbol('CategoryMeasurementStrategy');