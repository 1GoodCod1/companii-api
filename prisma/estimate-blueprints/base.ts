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
  for (const unit of config.laborUnits ?? []) {
    if (!isEstimateMeasurementUnit(unit)) {
      throw new Error(`Invalid laborUnits entry "${unit}" in blueprint "${slug}"`);
    }
  }
  validateBlueprintStructure(slug, config);
}

function assertUnique(slug: string, label: string, values: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label} "${value}" in blueprint "${slug}"`);
    }
    seen.add(value);
  }
}

function validateBlueprintStructure(slug: string, config: EstimateBlueprintConfig): void {
  const customFieldKeys = (config.customFields ?? []).map((field) => field.key);
  const workModuleKeys = (config.workModules ?? []).map((module) => module.key);
  const stageCodes = new Set(config.defaultStages.map((stage) => stage.code));
  const fieldKeys = new Set(customFieldKeys);
  const questionKeys = new Set(config.diagnosticQuestions.map((question) => question.key));
  const moduleKeys = new Set(workModuleKeys);

  assertUnique(slug, 'stage code', config.defaultStages.map((stage) => stage.code));
  assertUnique(slug, 'custom field key', customFieldKeys);
  assertUnique(slug, 'work module key', workModuleKeys);

  for (const stage of config.defaultStages) {
    if (stage.moduleKey && !moduleKeys.has(stage.moduleKey)) {
      throw new Error(`Stage "${stage.code}" references unknown module "${stage.moduleKey}" in blueprint "${slug}"`);
    }
  }

  for (const module of config.workModules ?? []) {
    for (const stageCode of module.stageCodes) {
      if (!stageCodes.has(stageCode)) {
        throw new Error(`Module "${module.key}" references unknown stage "${stageCode}" in blueprint "${slug}"`);
      }
    }
    for (const fieldKey of module.fieldKeys) {
      if (!fieldKeys.has(fieldKey) && !questionKeys.has(fieldKey)) {
        throw new Error(`Module "${module.key}" references unknown field "${fieldKey}" in blueprint "${slug}"`);
      }
    }
  }

  for (const rule of config.pricingRules) {
    if (!stageCodes.has(rule.stageCode)) {
      throw new Error(`Pricing rule "${rule.description}" references unknown stage "${rule.stageCode}" in blueprint "${slug}"`);
    }
    if (rule.moduleKey && !moduleKeys.has(rule.moduleKey)) {
      throw new Error(`Pricing rule "${rule.description}" references unknown module "${rule.moduleKey}" in blueprint "${slug}"`);
    }
    if (rule.enabledWhen?.moduleEnabled && !moduleKeys.has(rule.enabledWhen.moduleEnabled)) {
      throw new Error(`Pricing rule "${rule.description}" references unknown enabled module "${rule.enabledWhen.moduleEnabled}" in blueprint "${slug}"`);
    }
  }
}
