import type {
  BlueprintUrgencyImpact,
  EstimateBlueprintConfig,
} from '../../../../../prisma/estimate-blueprint-config.types';

export type UrgencyLevel = 'normal' | 'urgent' | 'emergency';

export function normalizeUrgency(raw: unknown): UrgencyLevel {
  if (raw == null || raw === '') return 'normal';
  const n = String(raw).trim().toLowerCase();
  if (n === 'emergency' || n === 'urgență' || n === 'urgenta') return 'emergency';
  if (n === 'urgent') return 'urgent';
  return 'normal';
}

export function resolveUrgencyLaborMultiplier(
  config: EstimateBlueprintConfig | null | undefined,
  level: UrgencyLevel,
): number {
  if (level === 'normal') return 1.0;
  const impact: BlueprintUrgencyImpact | undefined = config?.urgencyImpact;
  if (!impact) return 1.0;
  const pick = level === 'emergency' ? impact.emergency : impact.urgent;
  return Number.isFinite(pick) ? pick : 1.0;
}

export function resolveUrgencyMaterialMultiplier(
  config: EstimateBlueprintConfig | null | undefined,
  level: UrgencyLevel,
): number {
  const impact = config?.urgencyImpact;
  if (!impact?.appliesToMaterial) return 1.0;
  return resolveUrgencyLaborMultiplier(config, level);
}
