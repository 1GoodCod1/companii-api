import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprint-config.types';
import { readEnabledWorkModules } from '../blueprint/work-modules.util';
import { filterStagesWithMeaningfulLines, getVisibleStages } from '../blueprint/stage-visibility.util';

export type WorksheetStageSource = {
  code: string;
  lines?: Array<{ source?: string | null }> | null;
  stageTotal?: unknown;
};

export function filterWorksheetStages<T extends WorksheetStageSource>(
  stages: T[],
  config: EstimateBlueprintConfig | null | undefined,
  diagnostic: Record<string, unknown> | null | undefined,
): T[] {
  if (!stages.length) return stages;

  const enabledModules = config ? readEnabledWorkModules(diagnostic, config) : [];
  const moduleVisible = config ? getVisibleStages(stages, config, enabledModules) : stages;
  return filterStagesWithMeaningfulLines(moduleVisible);
}

export function isWorksheetMaterialLine(line: {
  unit: string;
  description: string;
  source?: string | null;
}): boolean {
  if (line.source === 'stage-default') return false;
  const description = line.description.toLowerCase();
  return !(
    line.unit === 'ore' ||
    line.unit === 'h' ||
    description.includes('manoperă') ||
    description.includes('manopera') ||
    description.includes('lucrări') ||
    description.includes('lucrari') ||
    description.includes('labor')
  );
}

export function formatWorksheetMaterialDescription(description: string): string {
  return description
    .replace(/\s*[—–-]\s*material\s*$/i, '')
    .replace(/\s*\(material\)\s*$/i, '')
    .trim();
}
