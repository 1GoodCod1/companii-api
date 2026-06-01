import type { BlueprintPricingRule, EstimateBlueprintConfig } from '../pricing.types';
import { isEstimateServiceCategorySlug } from '../../../../common/constants/estimate-category-slugs.constants';
import { CUSTOM_PRICING_KEYS, readOptionalPositiveNumber } from '../shared/pricing-shared.util';
import type { CustomPricingOverrideResult, MeasurementMap } from './pricing-engine.types';

function resolveCustomSqmStageCode(stages: Array<{ code: string }>): string {
  return (
    stages.find((stage) => stage.code === 'executie')?.code ??
    stages.find((stage) => stage.code === 'finisaj')?.code ??
    stages[0]?.code ??
    'executie'
  );
}

function resolveCustomLaborHoursStageCode(stages: Array<{ code: string }>): string {
  return (
    stages.find((stage) => stage.code === 'lucrari')?.code ??
    stages.find((stage) => stage.code === 'executie')?.code ??
    stages[0]?.code ??
    'executie'
  );
}

function applyCustomUnitPriceSqm(
  measurements: MeasurementMap,
  rules: BlueprintPricingRule[],
  stages: Array<{ code: string }>,
  categorySlug: string | null | undefined,
  customUnitPriceSqm: number,
): BlueprintPricingRule[] {
  const isServiceCategory = categorySlug != null && isEstimateServiceCategorySlug(categorySlug);
  let nextRules = [...rules];

  if (isServiceCategory) {
    const hourlyLaborRules = nextRules.filter((rule) => rule.unit === 'ore' && rule.kind === 'labor');
    if (hourlyLaborRules.length) {
      return nextRules.map((rule) =>
        rule.unit === 'ore' && rule.kind === 'labor'
          ? { ...rule, unitPrice: customUnitPriceSqm }
          : rule,
      );
    }
    return nextRules;
  }

  measurements.totalFloorArea ??=
    measurements.finishArea ?? measurements.cleanArea ?? measurements.tileFloorArea ?? 12;

  const sqmLaborRules = nextRules.filter((rule) => rule.unit === 'm²' && rule.kind === 'labor');
  if (sqmLaborRules.length) {
    return nextRules.map((rule) =>
      rule.unit === 'm²' && rule.kind === 'labor'
        ? { ...rule, unitPrice: customUnitPriceSqm }
        : rule,
    );
  }

  nextRules.push({
    stageCode: resolveCustomSqmStageCode(stages),
    description: 'Cost Lucrări personalizat / m²',
    unit: 'm²',
    qtyKey: 'totalFloorArea',
    unitPrice: customUnitPriceSqm,
    kind: 'labor',
  });

  return nextRules;
}

function applyCustomLaborHoursRule(
  config: EstimateBlueprintConfig,
  rules: BlueprintPricingRule[],
  stages: Array<{ code: string }>,
): BlueprintPricingRule[] {
  const laborHourRules = rules.filter((rule) => rule.qtyKey === 'laborHours');
  if (laborHourRules.length) {
    return rules;
  }

  return [
    ...rules,
    {
      stageCode: resolveCustomLaborHoursStageCode(stages),
      description: 'Cost Lucrări personalizat',
      unit: 'ore',
      qtyKey: 'laborHours',
      unitPrice: config.defaultLaborRate,
      kind: 'labor',
    },
  ];
}

export function applyCustomPricingOverrides(
  config: EstimateBlueprintConfig,
  measurements: MeasurementMap,
  diagnosticAnswers: Record<string, unknown> | null | undefined,
  rules: BlueprintPricingRule[],
  stages: Array<{ code: string }>,
  categorySlug?: string | null,
): CustomPricingOverrideResult {
  const customUnitPriceSqm = readOptionalPositiveNumber(
    diagnosticAnswers,
    CUSTOM_PRICING_KEYS.unitPriceSqm,
  );
  const customDurationDays = readOptionalPositiveNumber(
    diagnosticAnswers,
    CUSTOM_PRICING_KEYS.durationDays,
  );
  const customLaborHours = readOptionalPositiveNumber(
    diagnosticAnswers,
    CUSTOM_PRICING_KEYS.laborHours,
  );
  const customLaborTotal = readOptionalPositiveNumber(
    diagnosticAnswers,
    CUSTOM_PRICING_KEYS.laborTotal,
  );

  const nextMeasurements = { ...measurements };
  let nextRules = [...rules];

  if (customLaborHours) {
    nextMeasurements.laborHours = customLaborHours;
  }

  if (customUnitPriceSqm) {
    nextRules = applyCustomUnitPriceSqm(
      nextMeasurements,
      nextRules,
      stages,
      categorySlug,
      customUnitPriceSqm,
    );
  }

  if (customLaborHours) {
    nextRules = applyCustomLaborHoursRule(config, nextRules, stages);
  }

  return {
    measurements: nextMeasurements,
    rules: nextRules,
    customDurationDays,
    customLaborHours,
    customLaborTotal,
  };
}
