export type {
  BlueprintCustomField,
  BlueprintDiagnosticQuestion,
  BlueprintPlanPointType,
  BlueprintPricingRule,
  BlueprintPricingRuleEnabledWhen,
  BlueprintSiteType,
  BlueprintStageDef,
  BlueprintWizardStep,
  BlueprintWorkModule,
  EstimateBlueprintConfig,
} from '../estimate-blueprint-config.types';

export { baseConfig, SITE_TYPES, validateBlueprintUnits } from './base';
export { genericBlueprint } from './generic';
export {
  CATEGORY_BLUEPRINTS,
  acoperisBlueprint,
  acoperisPlatBlueprint,
  cleaningBlueprint,
  climaBlueprint,
  constructiiBlueprint,
  elektrikaBlueprint,
  fatadeBlueprint,
  itNetworksBlueprint,
  lucrariFinisajBlueprint,
  mobilaBlueprint,
  oknaDveriBlueprint,
  panouriSolareBlueprint,
  pavajBlueprint,
  santehnikaBlueprint,
} from './registry';

import type { EstimateBlueprintConfig } from '../estimate-blueprint-config.types';
import { CATEGORY_BLUEPRINTS } from './registry';

export function categoryHasEstimateBlueprint(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATEGORY_BLUEPRINTS, slug);
}

export function buildBlueprintConfig(category: {
  name: string;
  slug: string;
}): EstimateBlueprintConfig {
  if (!categoryHasEstimateBlueprint(category.slug)) {
    throw new Error(`No estimate blueprint configured for category slug: ${category.slug}`);
  }
  return CATEGORY_BLUEPRINTS[category.slug]!;
}

export function buildBlueprintName(categoryName: string): string {
  return `Smetă inteligentă — ${categoryName}`;
}
