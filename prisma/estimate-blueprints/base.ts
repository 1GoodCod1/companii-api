import type { EstimateBlueprintConfig } from '../estimate-blueprint-config.types';
import { isEstimateMeasurementUnit } from '../estimate-measurement-units';

export const SITE_TYPES: EstimateBlueprintConfig['siteTypes'] = [
  { value: 'apartment', label: 'Apartament' },
  { value: 'house', label: 'Casă' },
  { value: 'commercial', label: 'Spațiu comercial' },
];

export function baseConfig(
  overrides: Partial<EstimateBlueprintConfig> &
    Pick<
      EstimateBlueprintConfig,
      'defaultStages' | 'pricingRules' | 'diagnosticQuestions' | 'planPointTypes'
    >,
): EstimateBlueprintConfig {
  return {
    wizardSteps: ['object', 'plan', 'diagnostic', 'stages', 'review'],
    siteTypes: SITE_TYPES,
    defaultLaborRate: 185,
    defaultMarginPct: 12,
    ...overrides,
  };
}

export function validateBlueprintUnits(
  slug: string,
  config: EstimateBlueprintConfig,
): void {
  for (const field of config.customFields ?? []) {
    if (field.unit && !isEstimateMeasurementUnit(field.unit)) {
      throw new Error(`Invalid customField unit "${field.unit}" in blueprint "${slug}"`);
    }
  }
  for (const rule of config.pricingRules) {
    if (!isEstimateMeasurementUnit(rule.unit)) {
      throw new Error(`Invalid pricingRule unit "${rule.unit}" in blueprint "${slug}"`);
    }
  }
}
