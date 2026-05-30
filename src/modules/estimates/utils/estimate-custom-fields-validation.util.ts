import type {
  BlueprintCustomField,
  EstimateBlueprintConfig,
} from '../../../../prisma/estimate-blueprint-config.types';
import {
  ENABLED_WORK_MODULES_KEY,
  isCustomFieldActive,
  isCustomFieldRequired,
  readEnabledWorkModules,
} from './work-modules.util';
import { CUSTOM_PRICING_KEYS } from '../pricing/pricing-engine-utils';

export const ESTIMATE_VALIDATION_FAILED = 'ESTIMATE_VALIDATION_FAILED';

export type EstimateFieldWarning = {
  key: string;
  message: string;
};

export type EstimateCustomFieldsValidationResult = {
  ok: boolean;
  code?: typeof ESTIMATE_VALIDATION_FAILED;
  fields?: Record<string, string>;
  warnings: EstimateFieldWarning[];
};

export function isEstimateDiagnosticStrict(): boolean {
  return process.env.ESTIMATE_DIAGNOSTIC_STRICT === 'true';
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function collectKnownDiagnosticKeys(config: EstimateBlueprintConfig): Set<string> {
  const keys = new Set<string>([ENABLED_WORK_MODULES_KEY]);
  for (const field of config.customFields ?? []) {
    keys.add(field.key);
  }
  for (const question of config.diagnosticQuestions) {
    keys.add(question.key);
  }
  for (const key of Object.values(CUSTOM_PRICING_KEYS) as string[]) {
    keys.add(key);
  }
  return keys;
}

function parseNumericFieldValue(field: BlueprintCustomField, value: unknown): number | null {
  if (isEmptyValue(value)) return null;

  const numVal = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numVal)) {
    return Number.NaN;
  }
  return numVal;
}

export function evaluateCustomFieldWarningRule(
  when: string,
  answers: Record<string, unknown>,
): boolean {
  const normalized = when.trim();

  const stringEqMatch = normalized.match(/^(\w+)\s*===\s*'([^']+)'$/);
  if (stringEqMatch) {
    return String(answers[stringEqMatch[1]] ?? '') === stringEqMatch[2];
  }

  const cmpMatch = normalized.match(/^(\w+)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (cmpMatch) {
    const left = Number(answers[cmpMatch[1]]);
    const right = Number(cmpMatch[3]);
    if (!Number.isFinite(left)) return false;

    switch (cmpMatch[2]) {
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      default:
        return false;
    }
  }

  return false;
}

function collectFieldWarnings(
  field: BlueprintCustomField,
  answers: Record<string, unknown>,
): EstimateFieldWarning[] {
  const warnings: EstimateFieldWarning[] = [];

  for (const rule of field.warningRules ?? []) {
    if (evaluateCustomFieldWarningRule(rule.when, answers)) {
      warnings.push({ key: field.key, message: rule.message });
    }
  }

  return warnings;
}

export function validateCustomFieldsAnswers(
  config: EstimateBlueprintConfig,
  answers: Record<string, unknown>,
  options?: { strictUnknownKeys?: boolean; ignoreRequired?: boolean },
): EstimateCustomFieldsValidationResult {
  const fieldErrors: Record<string, string> = {};
  const warnings: EstimateFieldWarning[] = [];

  if (!config.customFields?.length) {
    return { ok: true, warnings };
  }

  const enabledModules = readEnabledWorkModules(answers, config);
  const knownKeys = collectKnownDiagnosticKeys(config);
  const strictUnknownKeys = options?.strictUnknownKeys ?? isEstimateDiagnosticStrict();

  for (const key of Object.keys(answers)) {
    if (knownKeys.has(key)) continue;

    if (strictUnknownKeys) {
      fieldErrors[key] = 'Câmp necunoscut';
    } else {
      console.warn(`[estimate-validation] Unknown diagnostic key "${key}" ignored`);
    }
  }

  for (const field of config.customFields) {
    if (!isCustomFieldActive(field, config, enabledModules, answers)) {
      continue;
    }

    const rawValue = answers[field.key];
    const val = rawValue ?? field.defaultValue;

    if (isCustomFieldRequired(field, config, enabledModules, answers) && isEmptyValue(val)) {
      if (!options?.ignoreRequired) {
        fieldErrors[field.key] = `${field.label} este obligatoriu`;
        continue;
      }
    }

    if (isEmptyValue(val)) {
      warnings.push(...collectFieldWarnings(field, answers));
      continue;
    }

    if (field.type === 'number') {
      const numVal = parseNumericFieldValue(field, val);
      if (Number.isNaN(numVal)) {
        fieldErrors[field.key] = 'Trebuie să fie un număr valid';
        continue;
      }

      if (field.validation?.min !== undefined && numVal! < field.validation.min) {
        fieldErrors[field.key] = `Minim ${field.validation.min}`;
      }
      if (field.validation?.max !== undefined && numVal! > field.validation.max) {
        fieldErrors[field.key] = `Maxim ${field.validation.max}`;
      }
    }

    if (field.type === 'select' && field.options && !field.options.includes(String(val))) {
      fieldErrors[field.key] = 'Opțiune invalidă';
    }

    warnings.push(...collectFieldWarnings(field, { ...answers, [field.key]: val }));
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: ESTIMATE_VALIDATION_FAILED,
      fields: fieldErrors,
      warnings,
    };
  }

  return { ok: true, warnings };
}
