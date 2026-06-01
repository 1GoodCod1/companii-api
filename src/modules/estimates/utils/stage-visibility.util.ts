import type {
  BlueprintStageDef,
  EstimateBlueprintConfig,
} from '../../../../prisma/estimate-blueprint-config.types';

export type StageLineLike = {
  source?: string | null;
};

export type StageLike = {
  code: string;
  lines?: StageLineLike[] | null;
  stageTotal?: unknown;
};

export type StageVisibility<T extends StageLike = StageLike> = {
  stage: T;
  blueprintDef?: BlueprintStageDef;
  meaningfulLineCount: number;
  hidden: boolean;
  hiddenReason?: 'optional-module-off' | 'optional-empty';
};

export function computeStageVisibility<T extends StageLike>(
  stages: T[],
  config: EstimateBlueprintConfig | null | undefined,
  enabledModules: string[],
): StageVisibility<T>[] {
  const defByCode = new Map<string, BlueprintStageDef>();
  for (const def of config?.defaultStages ?? []) {
    defByCode.set(def.code, def);
  }
  const enabledSet = new Set(enabledModules);

  return stages.map((stage) => {
    const blueprintDef = defByCode.get(stage.code);
    const meaningfulLineCount = (stage.lines ?? []).filter(
      (line) => line.source !== 'stage-default',
    ).length;

    let hidden = false;
    let hiddenReason: StageVisibility<T>['hiddenReason'];

    if (blueprintDef?.moduleKey && !enabledSet.has(blueprintDef.moduleKey)) {
      if (meaningfulLineCount === 0) {
        hidden = true;
        hiddenReason = 'optional-module-off';
      }
    } else if (blueprintDef?.optional && meaningfulLineCount === 0 && !blueprintDef.moduleKey) {
      hidden = true;
      hiddenReason = 'optional-empty';
    }

    return { stage, blueprintDef, meaningfulLineCount, hidden, hiddenReason };
  });
}

export function getVisibleStages<T extends StageLike>(
  stages: T[],
  config: EstimateBlueprintConfig | null | undefined,
  enabledModules: string[],
): T[] {
  return computeStageVisibility(stages, config, enabledModules)
    .filter((entry) => !entry.hidden)
    .map((entry) => entry.stage);
}

export function filterStagesWithMeaningfulLines<T extends StageLike>(stages: T[]): T[] {
  return stages.filter((stage) => {
    const meaningfulLineCount = (stage.lines ?? []).filter(
      (line) => line.source !== 'stage-default',
    ).length;
    if (meaningfulLineCount > 0) return true;
    const stageTotal = Number(stage.stageTotal ?? 0);
    return Number.isFinite(stageTotal) && stageTotal > 0;
  });
}
