import type {
  BlueprintAccessDifficultyImpact,
  EstimateBlueprintConfig,
} from '../../../../prisma/estimate-blueprint-config.types';

export type AccessDifficultyLevel = 'easy' | 'medium' | 'difficult';

/** Normalizes mixed RO/EN/RU/legacy values down to canonical 'easy'|'medium'|'difficult'. */
export function normalizeAccessDifficulty(raw: unknown): AccessDifficultyLevel {
  if (raw == null || raw === '') return 'easy';
  const normalized = String(raw)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (normalized === 'difficult' || normalized === 'dificil' || normalized === 'hard') {
    return 'difficult';
  }
  if (normalized === 'medium' || normalized === 'mediu') return 'medium';
  return 'easy';
}

/**
 * Resolves access difficulty as project-level first (Slice 2), else falls back
 * to diagnostic answer (legacy santehnika `accessDifficulty` customField).
 */
export function resolveAccessDifficultyLevel(
  projectAccessDifficulty: unknown,
  diagnostic: Record<string, unknown> | null | undefined,
): AccessDifficultyLevel {
  if (projectAccessDifficulty != null && projectAccessDifficulty !== '') {
    return normalizeAccessDifficulty(projectAccessDifficulty);
  }
  return normalizeAccessDifficulty(diagnostic?.accessDifficulty);
}

/**
 * Returns the labor multiplier the category's blueprint declared for the
 * resolved access level. Blueprints without `accessDifficultyImpact` get 1.0
 * (= no impact), matching the implementation_plan.md note that cleaning /
 * it-networks shouldn't be affected.
 */
export function resolveAccessDifficultyLaborMultiplier(
  config: EstimateBlueprintConfig | null | undefined,
  level: AccessDifficultyLevel,
): number {
  const impact: BlueprintAccessDifficultyImpact | undefined = config?.accessDifficultyImpact;
  if (!impact) return 1.0;
  if (level === 'difficult') return Number.isFinite(impact.difficult) ? impact.difficult : 1.0;
  if (level === 'medium') return Number.isFinite(impact.medium) ? impact.medium : 1.0;
  return Number.isFinite(impact.easy) ? impact.easy : 1.0;
}

/**
 * Same as labor multiplier but only applies when the blueprint explicitly opted
 * in via `appliesToMaterial: true` (mobila / okna-dveri transport risk).
 */
export function resolveAccessDifficultyMaterialMultiplier(
  config: EstimateBlueprintConfig | null | undefined,
  level: AccessDifficultyLevel,
): number {
  const impact = config?.accessDifficultyImpact;
  if (!impact?.appliesToMaterial) return 1.0;
  return resolveAccessDifficultyLaborMultiplier(config, level);
}
