import type { EstimateBlueprintConfig } from '../../../../prisma/estimate-blueprint-config.types';
import { mergeEnabledWorkModulesIntoDiagnostic } from '../utils/work-modules.util';

export const GLOBAL_PLAN_DERIVED_QTY_KEYS = new Set<string>([
  'baseArea',
  'wallHeight',
  'storyCount',
  'roofSlope',
  'facadeArea',
  'scaffoldingArea',
  'totalFloorArea',
  'roomCount',
  'plumbingPoints',
  'electricPoints',
  'panelCount',
  'acUnits',
  'networkPoints',
  'apCount',
  'cameraCount',
  'rackCount',
  'inverterCount',
  'batteryCount',
  'windowCount',
  'doorCount',
  'cabinetCount',
  'wardrobeCount',
  'pavementArea',
  'borderLengthM',
]);

export function buildSampleDiagnosticAnswers(
  config: EstimateBlueprintConfig,
): Record<string, unknown> {
  const diagnostic: Record<string, unknown> = {};

  for (const field of config.customFields ?? []) {
    if (field.type === 'boolean') {
      diagnostic[field.key] = field.defaultValue === true ? true : true;
    } else if (field.type === 'number') {
      const min = field.validation?.min;
      diagnostic[field.key] =
        typeof field.defaultValue === 'number' && field.defaultValue > 0
          ? field.defaultValue
          : typeof min === 'number' && min > 0
            ? min
            : 1;
    } else if (field.type === 'select') {
      diagnostic[field.key] = field.options?.[0] ?? field.defaultValue ?? '';
    } else {
      diagnostic[field.key] = field.defaultValue ?? 'sample';
    }
  }

  return mergeEnabledWorkModulesIntoDiagnostic(diagnostic, config);
}

export function collectResolvableQtyKeys(
  config: EstimateBlueprintConfig,
  derivedMeasurementKeys: Iterable<string>,
): Set<string> {
  const keys = new Set<string>(derivedMeasurementKeys);

  for (const field of config.customFields ?? []) {
    keys.add(field.key);
  }
  for (const question of config.diagnosticQuestions) {
    keys.add(question.key);
    if (question.affectsKey) keys.add(question.affectsKey);
  }
  for (const module of config.workModules ?? []) {
    for (const key of module.fieldKeys) keys.add(key);
    for (const key of module.requiresQtyKeys ?? []) keys.add(key);
  }
  for (const key of GLOBAL_PLAN_DERIVED_QTY_KEYS) {
    keys.add(key);
  }

  return keys;
}

export function findOrphanPricingQtyKeys(
  slug: string,
  config: EstimateBlueprintConfig,
  derivedMeasurementKeys: Iterable<string>,
): string[] {
  const resolvable = collectResolvableQtyKeys(config, derivedMeasurementKeys);
  const orphans: string[] = [];

  for (const rule of config.pricingRules) {
    if (!resolvable.has(rule.qtyKey)) {
      orphans.push(rule.qtyKey);
    }
  }

  return [...new Set(orphans)];
}

export function formatOrphanQtyKeyReport(
  slug: string,
  orphans: string[],
): string {
  return `Blueprint "${slug}" has orphan qtyKeys: ${orphans.join(', ')}`;
}

export type DerivedMultiplierBridge = {
  multiplierKey: string;
  viaQtyKey: string;
};

export function collectPricingMeasurementKeys(config: EstimateBlueprintConfig): Set<string> {
  const keys = new Set<string>();
  for (const rule of config.pricingRules ?? []) {
    keys.add(rule.qtyKey);
    if (rule.laborUnitPriceMultiplierKey) keys.add(rule.laborUnitPriceMultiplierKey);
    if (rule.materialUnitPriceMultiplierKey) keys.add(rule.materialUnitPriceMultiplierKey);
  }
  return keys;
}

export function findUnusedDerivedMultipliers(
  config: EstimateBlueprintConfig,
  multiplierKeys: string[],
  bridges: DerivedMultiplierBridge[] = [],
): string[] {
  const used = collectPricingMeasurementKeys(config);
  for (const bridge of bridges) {
    if (used.has(bridge.viaQtyKey)) used.add(bridge.multiplierKey);
  }
  return multiplierKeys.filter((key) => !used.has(key));
}
