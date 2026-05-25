import type { CompanySubscriptionPlan } from '@prisma/client';
import { hasMinPlan, SUBSCRIPTION_PLAN_ORDER } from './subscription-plan.constants';

/** Feature keys — keep in sync with companii-web/src/config/planEntitlements.ts */
export const PLAN_FEATURE_KEYS = [
  'interventions',
  'calendar',
  'publicServices',
  'customers',
  'leads',
  'internalServices',
  'clientPortal',
  'reviewsManagement',
  'quotes',
  'invoices',
  'estimates',
  'estimateWorksheet',
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];

/** Minimum subscription plan required for each feature. */
export const PLAN_FEATURE_MIN: Record<PlanFeatureKey, CompanySubscriptionPlan> = {
  interventions: 'FREE',
  calendar: 'FREE',
  publicServices: 'FREE',
  customers: 'PRO',
  leads: 'PRO',
  internalServices: 'PRO',
  clientPortal: 'PRO',
  reviewsManagement: 'FREE',
  quotes: 'BUSINESS',
  invoices: 'BUSINESS',
  estimates: 'BUSINESS',
  estimateWorksheet: 'PRO',
};

export function minPlanForFeature(feature: PlanFeatureKey): CompanySubscriptionPlan {
  return PLAN_FEATURE_MIN[feature];
}

export function plansForFeature(feature: PlanFeatureKey): CompanySubscriptionPlan[] {
  const min = minPlanForFeature(feature);
  const minRank = SUBSCRIPTION_PLAN_ORDER.indexOf(min);
  return SUBSCRIPTION_PLAN_ORDER.filter((_, index) => index >= minRank);
}

export function planHasFeature(
  planCode: CompanySubscriptionPlan,
  feature: PlanFeatureKey,
): boolean {
  return hasMinPlan(planCode, minPlanForFeature(feature));
}

export const PLAN_LIMITS: Record<
  CompanySubscriptionPlan,
  { maxTechnicians: number | null; maxInterventionsPerMonth: number | null }
> = {
  FREE: { maxTechnicians: 1, maxInterventionsPerMonth: 20 },
  PRO: { maxTechnicians: 10, maxInterventionsPerMonth: 150 },
  BUSINESS: { maxTechnicians: null, maxInterventionsPerMonth: null },
};

/** Display name + list price (MDL) for subscription catalog / seed. */
export const PLAN_CATALOG: Record<
  CompanySubscriptionPlan,
  { name: string; price: number }
> = {
  FREE: { name: 'Free', price: 0 },
  PRO: { name: 'Pro', price: 499 },
  BUSINESS: { name: 'Business', price: 999 },
};

export const PLAN_CODES: CompanySubscriptionPlan[] = ['FREE', 'PRO', 'BUSINESS'];

export const PLAN_MARKETING_FEATURES: Record<CompanySubscriptionPlan, string[]> = {
  FREE: [
    'Profil companie public verificat',
    'Catalog servicii & prețuri public',
    'Cereri online de la clienți',
    '1 tehnician activ',
    'Până la 20 lucrări / lună',
    'Calendar lucrări',
    'Gestionare recenzii',
  ],
  PRO: [
    'Tot ce include Free',
    'CRM clienți + cereri (leads)',
    'Portal clienți securizat',
    'Catalog intern servicii pentru ofertare',
    'Fișă de execuție (plan & etape pe teren)',
    'Până la 10 tehnicieni',
    'Până la 150 lucrări / lună',
    'Istoric status intervenții',
  ],
  BUSINESS: [
    'Tot ce include Pro',
    'Smete inteligente (plan 2D, blueprints)',
    'Oferte comerciale + PDF',
    'Facturi fiscale TVA + export CSV',
    'Tehnicieni nelimitați',
    'Lucrări nelimitate',
    'Suport prioritar',
  ],
};
