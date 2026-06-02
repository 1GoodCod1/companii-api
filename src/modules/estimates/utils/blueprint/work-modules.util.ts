import type {
  BlueprintCustomField,
  BlueprintPricingRule,
  BlueprintWorkModule,
  EstimateBlueprintConfig,
} from '../../../../../prisma/estimate-blueprint-config.types';
import { readCleaningEnabledWorkModules } from './cleaning-work-modules.util';

export const ENABLED_WORK_MODULES_KEY = 'enabledWorkModules';

export function getDefaultEnabledWorkModules(config: EstimateBlueprintConfig): string[] {
  if (!config.workModules?.length) return [];
  return config.workModules
    .filter((module) => module.defaultEnabled !== false)
    .map((module) => module.key);
}

export function readEnabledWorkModules(
  diagnostic: Record<string, unknown> | null | undefined,
  config: EstimateBlueprintConfig,
): string[] {
  const validKeys = new Set(config.workModules?.map((module) => module.key) ?? []);
  const raw = diagnostic?.[ENABLED_WORK_MODULES_KEY];

  if (Array.isArray(raw)) {
    return raw.filter(
      (key): key is string => typeof key === 'string' && validKeys.has(key),
    );
  }

  return getDefaultEnabledWorkModules(config);
}

export function mergeEnabledWorkModulesIntoDiagnostic(
  diagnostic: Record<string, unknown>,
  config: EstimateBlueprintConfig,
): Record<string, unknown> {
  const enabled = readEnabledWorkModules(diagnostic, config);
  return {
    ...diagnostic,
    [ENABLED_WORK_MODULES_KEY]: enabled,
  };
}

export function findWorkModuleForField(
  config: EstimateBlueprintConfig,
  fieldKey: string,
): BlueprintWorkModule | undefined {
  return config.workModules?.find((module) => module.fieldKeys.includes(fieldKey));
}

export function findWorkModulesForField(
  config: EstimateBlueprintConfig,
  fieldKey: string,
): BlueprintWorkModule[] {
  return config.workModules?.filter((module) => module.fieldKeys.includes(fieldKey)) ?? [];
}

export function isCustomFieldActive(
  field: BlueprintCustomField,
  config: EstimateBlueprintConfig,
  enabledModules: string[],
  diagnostic?: Record<string, unknown> | null,
): boolean {
  const modules = findWorkModulesForField(config, field.key);
  if (modules.length > 0 && !modules.some((module) => enabledModules.includes(module.key))) {
    return false;
  }

  if (field.dependentOnKey && diagnostic) {
    const val = diagnostic[field.dependentOnKey];
    if (field.dependentOnValues?.length) {
      if (!field.dependentOnValues.includes(String(val ?? ''))) {
        return false;
      }
    } else if (!val) {
      return false;
    }
  }

  return true;
}

export function isCustomFieldRequired(
  field: BlueprintCustomField,
  config: EstimateBlueprintConfig,
  enabledModules: string[],
  diagnostic?: Record<string, unknown> | null,
): boolean {
  if (!field.required) return false;
  return isCustomFieldActive(field, config, enabledModules, diagnostic);
}

export function isPricingRuleActive(
  rule: BlueprintPricingRule,
  enabledModules: string[],
  measurements: Record<string, number>,
  config: EstimateBlueprintConfig,
): boolean {
  if (!config.workModules?.length) return true;

  const moduleKey = rule.moduleKey ?? rule.enabledWhen?.moduleEnabled;
  if (moduleKey && !enabledModules.includes(moduleKey)) {
    return false;
  }

  const when = rule.enabledWhen;
  if (when?.moduleEnabled && !enabledModules.includes(when.moduleEnabled)) {
    return false;
  }
  if (when?.anyQtyKeys?.length) {
    const hasQty = when.anyQtyKeys.some((key) => (measurements[key] ?? 0) > 0);
    if (!hasQty) return false;
  }
  if (when?.allQtyKeys?.length) {
    const allQty = when.allQtyKeys.every((key) => (measurements[key] ?? 0) > 0);
    if (!allQty) return false;
  }

  return true;
}

export function readEnabledWorkModulesForCategory(
  categorySlug: string | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
  config: EstimateBlueprintConfig,
): string[] {
  if (categorySlug === 'cleaning') {
    return readCleaningEnabledWorkModules(diagnostic, config);
  }
  return readEnabledWorkModules(diagnostic, config);
}

export function validateEnabledWorkModules(
  config: EstimateBlueprintConfig,
  enabledModules: string[],
): void {
  if (!config.workModules?.length) return;

  const validKeys = new Set(config.workModules.map((module) => module.key));
  for (const key of enabledModules) {
    if (!validKeys.has(key)) {
      throw new Error(`Modul de lucru necunoscut: ${key}`);
    }
  }
}
