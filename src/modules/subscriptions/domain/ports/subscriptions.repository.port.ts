import type { CompanyPlan, CompanySubscription, CompanySubscriptionPlan, Prisma } from '@prisma/client';

export const SUBSCRIPTIONS_REPOSITORY = Symbol('SubscriptionsRepository');

export interface SubscriptionsRepository {
  findPlans(): Promise<CompanyPlan[]>;
  findPlanByCode(code: CompanySubscriptionPlan): Promise<CompanyPlan | null>;
  findSubscriptionByCompanyId(companyId: string): Promise<(CompanySubscription & { plan: CompanyPlan }) | null>;
  computeSubscriptionUsage(companyId: string): Promise<{
    activeTechnicians: number;
    pendingTechnicianInvites: number;
    interventionsThisMonth: number;
  }>;
  upsertSubscription(
    companyId: string,
    createData: Prisma.CompanySubscriptionUncheckedCreateInput,
    updateData: Prisma.CompanySubscriptionUncheckedUpdateInput,
  ): Promise<CompanySubscription>;
  updateSubscription(
    companyId: string,
    data: Prisma.CompanySubscriptionUncheckedUpdateInput,
  ): Promise<CompanySubscription & { plan: CompanyPlan }>;
}
