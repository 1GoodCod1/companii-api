import type { CompanySubscriptionPlan } from '@prisma/client';

export const SUBSCRIPTION_PLAN_ORDER: CompanySubscriptionPlan[] = [
  'FREE',
  'PRO',
  'BUSINESS',
];

export const SUBSCRIPTION_CLAIMABLE_PLANS = ['PRO', 'BUSINESS'] as const satisfies readonly CompanySubscriptionPlan[];

export const DAYS_FREE_SUBSCRIPTION = 30;

export function planRank(code: CompanySubscriptionPlan): number {
  return SUBSCRIPTION_PLAN_ORDER.indexOf(code);
}

export function hasMinPlan(
  current: CompanySubscriptionPlan,
  required: CompanySubscriptionPlan,
): boolean {
  return planRank(current) >= planRank(required);
}
