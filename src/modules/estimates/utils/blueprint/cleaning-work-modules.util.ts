import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprint-config.types';
import { readBoolean } from '../../pricing/category/category-shared.util';
import { ENABLED_WORK_MODULES_KEY, readEnabledWorkModules } from './work-modules.util';

export function augmentCleaningEnabledWorkModules(
  diagnostic: Record<string, unknown> | null | undefined,
  config: EstimateBlueprintConfig,
  enabled: string[],
): string[] {
  if (!config.workModules?.length) return enabled;

  const next = new Set(enabled);
  if (readBoolean(diagnostic, 'trashRemoval')) {
    next.add('trash_removal');
  }
  if (readBoolean(diagnostic, 'kitchenDeepClean')) {
    next.add('kitchen');
  }
  return [...next];
}

export function readCleaningEnabledWorkModules(
  diagnostic: Record<string, unknown> | null | undefined,
  config: EstimateBlueprintConfig,
): string[] {
  return augmentCleaningEnabledWorkModules(
    diagnostic,
    config,
    readEnabledWorkModules(diagnostic, config),
  );
}

export function mergeCleaningEnabledWorkModulesIntoDiagnostic(
  diagnostic: Record<string, unknown>,
  config: EstimateBlueprintConfig,
): Record<string, unknown> {
  return {
    ...diagnostic,
    [ENABLED_WORK_MODULES_KEY]: readCleaningEnabledWorkModules(diagnostic, config),
  };
}
