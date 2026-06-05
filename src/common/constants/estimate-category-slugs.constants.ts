export const ESTIMATE_BLUEPRINT_CATEGORY_SLUGS = [
  'santehnika',
  'elektrika',
  'clima',
  'lucrari-finisaj',
  'acoperis',
  'acoperis-plat',
  'fatade',
  'okna-dveri',
  'mobila',
  'cleaning',
  'it-networks',
  'it-hardware',
  'it-web',
  'panouri-solare',
  'constructii',
  'pavaj',
] as const;

export type EstimateBlueprintCategorySlug = (typeof ESTIMATE_BLUEPRINT_CATEGORY_SLUGS)[number];

export const ESTIMATE_EXCLUDED_CATEGORY_SLUGS = [
  'smm-marketing',
  'design-grafic',
  'frumusete-ingrijire',
  'asigurari',
  'servicii-juridice',
  'avto',
] as const;

export type EstimateExcludedCategorySlug = (typeof ESTIMATE_EXCLUDED_CATEGORY_SLUGS)[number];

export const EXPECTED_ESTIMATE_BLUEPRINT_COUNT = ESTIMATE_BLUEPRINT_CATEGORY_SLUGS.length;

export function isEstimateBlueprintCategorySlug(slug: string): slug is EstimateBlueprintCategorySlug {
  return (ESTIMATE_BLUEPRINT_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

export function isEstimateExcludedCategorySlug(slug: string): slug is EstimateExcludedCategorySlug {
  return (ESTIMATE_EXCLUDED_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

export const ESTIMATE_SERVICE_CATEGORY_SLUGS = ['it-networks', 'it-hardware', 'it-web'] as const;

export type EstimateServiceCategorySlug = (typeof ESTIMATE_SERVICE_CATEGORY_SLUGS)[number];

export function isEstimateServiceCategorySlug(slug: string): slug is EstimateServiceCategorySlug {
  return (ESTIMATE_SERVICE_CATEGORY_SLUGS as readonly string[]).includes(slug);
}

export const ESTIMATE_RELATED_GROUP_HOST_SLUGS = ['lucrari-finisaj'] as const;

export type EstimateRelatedGroupHostSlug = (typeof ESTIMATE_RELATED_GROUP_HOST_SLUGS)[number];

export const ESTIMATE_RELATED_GROUP_TARGET_SLUGS = [
  'elektrika',
  'santehnika',
  'constructii',
] as const;

export type EstimateRelatedGroupTargetSlug = (typeof ESTIMATE_RELATED_GROUP_TARGET_SLUGS)[number];

export function canHostEstimateRelatedProjects(slug: string): slug is EstimateRelatedGroupHostSlug {
  return (ESTIMATE_RELATED_GROUP_HOST_SLUGS as readonly string[]).includes(slug);
}

export function canBeAddedAsRelatedEstimate(
  slug: string,
): slug is EstimateRelatedGroupTargetSlug {
  return (ESTIMATE_RELATED_GROUP_TARGET_SLUGS as readonly string[]).includes(slug);
}

export function canLinkEstimateCategories(sourceSlug: string, targetSlug: string): boolean {
  return canHostEstimateRelatedProjects(sourceSlug) && canBeAddedAsRelatedEstimate(targetSlug);
}
