import type { EstimateBlueprintConfig } from '../../../../prisma/estimate-blueprint-config.types';
import { filterWorksheetStages, type WorksheetStageSource } from './worksheet-stage-filter.util';

export type InterventionDescriptionStage = WorksheetStageSource & {
  id?: string;
  name: string;
  description?: string | null;
};

export type InterventionDescriptionAudience = 'staff' | 'client';

export function buildInterventionDescriptionFromEstimate(
  project: {
    number: string;
    stages: InterventionDescriptionStage[];
    blueprint?: { config: unknown } | null;
    diagnosticAnswers?: unknown;
  },
  estimateStageId?: string | null,
  audience: InterventionDescriptionAudience = 'staff',
): string {
  if (estimateStageId) {
    const stage = project.stages.find((entry) => entry.id === estimateStageId);
    if (!stage) {
      return buildSingleInterventionDescription(project.number, project, audience);
    }

    const config = project.blueprint?.config
      ? (project.blueprint.config as EstimateBlueprintConfig)
      : null;
    const diagnostic =
      project.diagnosticAnswers && typeof project.diagnosticAnswers === 'object'
        ? (project.diagnosticAnswers as Record<string, unknown>)
        : null;
    const active = filterWorksheetStages([stage], config, diagnostic);
    if (active.length === 0) {
      return stage.name;
    }

    const details = stage.description?.trim();
    return details ? `${stage.name}\n${details}` : stage.name;
  }

  return buildSingleInterventionDescription(project.number, project, audience);
}

export function buildSingleInterventionDescription(
  estimateNumber: string,
  project: {
    stages: InterventionDescriptionStage[];
    blueprint?: { config: unknown } | null;
    diagnosticAnswers?: unknown;
  },
  audience: InterventionDescriptionAudience = 'staff',
): string {
  const config = project.blueprint?.config
    ? (project.blueprint.config as EstimateBlueprintConfig)
    : null;
  const diagnostic =
    project.diagnosticAnswers && typeof project.diagnosticAnswers === 'object'
      ? (project.diagnosticAnswers as Record<string, unknown>)
      : null;

  const activeStages = filterWorksheetStages(project.stages, config, diagnostic);
  if (activeStages.length === 0) {
    return audience === 'client'
      ? `Lucrare asociată smetei ${estimateNumber}.`
      : `Lucrare din smetă ${estimateNumber}. Detalii tehnice: Fișă execuție.`;
  }

  const bullets = activeStages.map((stage) => `• ${stage.name}`).join('\n');
  if (audience === 'client') {
    return [`Lucrare din smetă ${estimateNumber}:`, bullets].join('\n');
  }

  return [
    `Etape de execuție (smetă ${estimateNumber}):`,
    bullets,
    '',
    'Detalii tehnice, materiale și checklist: Fișă execuție.',
  ].join('\n');
}

export function sanitizeInterventionDescriptionForTechnician(description: string): string {
  return description
    .split('\n')
    .filter((line) => !/^\s*•[^\n]*\(\s*0(\.0+)?\s*MDL\s*\)/i.test(line))
    .map((line) => line.replace(/\s*\(\s*[\d.,]+\s*MDL\s*\)/gi, '').trimEnd())
    .join('\n')
    .trim();
}
