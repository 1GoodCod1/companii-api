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

export function resolveAccessDifficultyLevel(
  projectAccessDifficulty: unknown,
  diagnostic: Record<string, unknown> | null | undefined,
): AccessDifficultyLevel {
  if (projectAccessDifficulty != null && projectAccessDifficulty !== '') {
    return normalizeAccessDifficulty(projectAccessDifficulty);
  }
  return normalizeAccessDifficulty(diagnostic?.accessDifficulty);
}

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

export function resolveAccessDifficultyMaterialMultiplier(
  config: EstimateBlueprintConfig | null | undefined,
  level: AccessDifficultyLevel,
): number {
  const impact = config?.accessDifficultyImpact;
  if (!impact?.appliesToMaterial) return 1.0;
  return resolveAccessDifficultyLaborMultiplier(config, level);
}
