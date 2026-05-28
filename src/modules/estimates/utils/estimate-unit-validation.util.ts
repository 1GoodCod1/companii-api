import type { EstimateBlueprintConfig } from '../../../../prisma/estimate-blueprint-config.types';
import {
  formatEstimateUnitsList,
  isEstimateMeasurementUnit,
  normalizeEstimateUnit,
  type EstimateMeasurementUnit,
} from '../../../../prisma/estimate-measurement-units';

export type EstimateUnitValidationIssue = {
  path: string;
  unit: string;
  message: string;
};

export function isEstimateUnitValidationStrict(): boolean {
  return process.env.ESTIMATE_UNIT_VALIDATION_STRICT !== 'false';
}

export function resolveEstimateUnit(
  raw: string,
  context: string,
  options?: { strict?: boolean },
): EstimateMeasurementUnit {
  const strict = options?.strict ?? isEstimateUnitValidationStrict();
  const normalized = normalizeEstimateUnit(raw);

  if (normalized) return normalized;

  const message = `Unitate invalidă "${raw}" (${context}). Permise: ${formatEstimateUnitsList()}.`;

  if (strict) {
    throw new Error(message);
  }

  console.warn(`[estimate-units] ${message}`);
  return 'buc';
}

export function collectBlueprintUnitIssues(config: EstimateBlueprintConfig): EstimateUnitValidationIssue[] {
  const issues: EstimateUnitValidationIssue[] = [];

  for (const field of config.customFields ?? []) {
    if (!field.unit) continue;
    if (!isEstimateMeasurementUnit(field.unit)) {
      issues.push({
        path: `customFields.${field.key}.unit`,
        unit: field.unit,
        message: `Unitate invalidă pentru câmp "${field.label}"`,
      });
    }
  }

  for (const rule of config.pricingRules) {
    if (!isEstimateMeasurementUnit(rule.unit)) {
      issues.push({
        path: `pricingRules.${rule.stageCode}.${rule.qtyKey}.unit`,
        unit: rule.unit,
        message: `Unitate invalidă pentru regula "${rule.description}"`,
      });
    }
  }

  return issues;
}

export function assertBlueprintUnitsValid(
  config: EstimateBlueprintConfig,
  context = 'blueprint config',
): void {
  const issues = collectBlueprintUnitIssues(config);
  if (!issues.length) return;

  const strict = isEstimateUnitValidationStrict();
  const detail = issues.map((i) => `${i.path}: ${i.unit}`).join('; ');

  if (strict) {
    throw new Error(`Unități invalide în ${context}: ${detail}`);
  }

  console.warn(`[estimate-units] Unități invalide în ${context} (non-strict): ${detail}`);
}
