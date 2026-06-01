import { Injectable } from '@nestjs/common';
import type { EstimateBlueprintConfig, BlueprintPricingRule } from './pricing.types';
import type { Plan2dData } from './plan2d.types';
import type { CompanyPricingModifiers } from '../../../../prisma/estimate-pricing-modifiers';
import { buildLinesFromRules as buildLinesFromRulesImpl } from './engine/build-lines-from-rules.util';
import { applyCustomPricingOverrides as applyCustomPricingOverridesImpl } from './engine/apply-custom-pricing-overrides.util';
import { deriveMeasurements as deriveMeasurementsImpl } from './engine/derive-measurements.util';
import { applyDiagnosticIncrements as applyDiagnosticIncrementsImpl } from './engine/apply-diagnostic-increments.util';
import { applyCompanyRateBook as applyCompanyRateBookImpl } from './engine/apply-company-rate-book.util';
import { buildPlan3dPreview as buildPlan3dPreviewImpl } from './plan2d/build-plan3d-preview.util';
import type {
  BuildLinesFromRulesOptions,
  CustomPricingOverrideResult,
  MeasurementMap,
  PricingRuleLine,
} from './engine/pricing-engine.types';

export type { Plan2dData } from './plan2d.types';
export type {
  BuildLinesFromRulesOptions,
  CustomPricingOverrideResult,
  MeasurementMap,
  PricingRuleLine,
} from './engine/pricing-engine.types';

@Injectable()
export class EstimatePricingEngine {
  deriveMeasurements(
    plan2d: Plan2dData | null | undefined,
    diagnosticAnswers: Record<string, unknown> | null | undefined,
    categorySlug?: string | null,
    pricingModifiers?: CompanyPricingModifiers | null,
  ): MeasurementMap {
    return deriveMeasurementsImpl(plan2d, diagnosticAnswers, categorySlug, pricingModifiers);
  }

  applyDiagnosticIncrements(
    config: EstimateBlueprintConfig,
    measurements: MeasurementMap,
    diagnosticAnswers: Record<string, unknown> | null | undefined,
  ): MeasurementMap {
    return applyDiagnosticIncrementsImpl(config, measurements, diagnosticAnswers);
  }

  buildLinesFromRules(
    rules: BlueprintPricingRule[],
    measurements: MeasurementMap,
    options?: BuildLinesFromRulesOptions,
  ): PricingRuleLine[] {
    return buildLinesFromRulesImpl(rules, measurements, options);
  }

  applyCompanyRateBook(
    rules: BlueprintPricingRule[],
    services: Array<{ name: string; defaultPrice: number | { toString(): string } }>,
  ): BlueprintPricingRule[] {
    return applyCompanyRateBookImpl(rules, services);
  }

  applyCustomPricingOverrides(
    config: EstimateBlueprintConfig,
    measurements: MeasurementMap,
    diagnosticAnswers: Record<string, unknown> | null | undefined,
    rules: BlueprintPricingRule[],
    stages: Array<{ code: string }>,
    categorySlug?: string | null,
  ): CustomPricingOverrideResult {
    return applyCustomPricingOverridesImpl(
      config,
      measurements,
      diagnosticAnswers,
      rules,
      stages,
      categorySlug,
    );
  }

  buildPlan3dPreview(plan2d: Plan2dData | null | undefined) {
    return buildPlan3dPreviewImpl(plan2d);
  }
}
