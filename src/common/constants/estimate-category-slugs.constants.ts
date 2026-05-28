/**
 * Category slugs with estimate blueprints (13 active) and excluded categories (6).
 * Keep in sync with companii-web/src/constants/estimateCategorySlugs.constants.ts (A-02).
 */
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
