import { Inject, Injectable } from '@nestjs/common';
import { CompanySubscriptionPlan } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { DAYS_FREE_SUBSCRIPTION, planRank } from '../../common/constants';
import { AuditAction } from '../audit/audit-action.enum';
import { AuditEntityType } from '../audit/audit-entity-type.enum';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../shared/cache/cache.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../companies/authorization/company-authorization.service';
import { SUBSCRIPTIONS_REPOSITORY } from './domain/ports/subscriptions.repository.port';
import type { PrismaSubscriptionsRepository } from './infrastructure/persistence/prisma-subscriptions.repository';

const SUBSCRIPTION_USAGE_TTL_SEC = 60;

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(SUBSCRIPTIONS_REPOSITORY)
    private readonly subscriptionsRepo: PrismaSubscriptionsRepository,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) { }

  listPlans() {
    return this.cache.getOrSet(
      this.cache.keys.plansAll(),
      () => this.subscriptionsRepo.findPlans(),
      this.cache.ttl.plansAll,
    );
  }

  me(companyId: string) {
    return this.buildMeResponse(companyId);
  }

  private async buildMeResponse(companyId: string) {
    const subscription = await this.subscriptionsRepo.findSubscriptionByCompanyId(companyId);
    if (!subscription) return null;

    const usage = await this.cache.getOrSet(
      this.buildUsageKey(companyId),
      () => this.subscriptionsRepo.computeSubscriptionUsage(companyId),
      SUBSCRIPTION_USAGE_TTL_SEC,
    );

    return {
      ...subscription,
      usage: {
        ...usage,
        maxTechnicians: subscription.plan.maxTechnicians,
        maxInterventionsPerMonth: subscription.plan.maxInterventionsPerMonth,
      },
    };
  }

  private buildUsageKey(companyId: string): string {
    return `cache:companii:subscription:usage:${companyId}`;
  }

  invalidateUsage(companyId: string): Promise<void> {
    return this.cache.del(this.buildUsageKey(companyId));
  }

  async adminSetPlan(
    companyId: string,
    planCode: CompanySubscriptionPlan,
    adminUserId: string,
  ) {
    const plan = await this.subscriptionsRepo.findPlanByCode(planCode);
    if (!plan) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const existing = await this.subscriptionsRepo.findSubscriptionByCompanyId(companyId);

    const result = await this.subscriptionsRepo.upsertSubscription(
      companyId,
      {
        companyId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        activatedByAdminId: adminUserId,
      },
      {
        planId: plan.id,
        status: 'ACTIVE',
        activatedByAdminId: adminUserId,
      },
    );
    await this.cache.invalidatePlans();

    void this.audit.log({
      userId: adminUserId,
      action: AuditAction.SUBSCRIPTION_CHANGED,
      entityType: AuditEntityType.Company,
      entityId: companyId,
      oldData: existing ? { planCode: existing.plan.code, status: existing.status } : undefined,
      newData: { planCode, status: 'ACTIVE' },
    });

    return result;
  }

  async claimFree(user: JwtPayload, planCode: CompanySubscriptionPlan) {
    const companyId = user.activeCompanyId;
    if (!companyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }

    if (planCode === 'FREE') {
      throw AppErrors.badRequest(AppErrorMessages.SUBSCRIPTION_PLAN_REQUIRED);
    }

    await this.companyAuth.assertCompanyOwner(user, companyId);

    const plan = await this.subscriptionsRepo.findPlanByCode(planCode);
    if (!plan) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const sub = await this.subscriptionsRepo.findSubscriptionByCompanyId(companyId);
    if (!sub) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (sub.plan.code === planCode) {
      throw AppErrors.badRequest(AppErrorMessages.SUBSCRIPTION_ALREADY_ON_PLAN);
    }

    const currentRank = planRank(sub.plan.code);
    const targetRank = planRank(planCode);
    if (targetRank <= currentRank) {
      throw AppErrors.badRequest(AppErrorMessages.SUBSCRIPTION_ALREADY_ON_PLAN);
    }

    // FREE → PRO/BUSINESS, PRO → BUSINESS
    const allowed =
      sub.plan.code === 'FREE' ||
      (sub.plan.code === 'PRO' && planCode === 'BUSINESS');
    if (!allowed) {
      throw AppErrors.badRequest(AppErrorMessages.SUBSCRIPTION_INVALID_UPGRADE);
    }

    const result = await this.subscriptionsRepo.updateSubscription(companyId, {
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodEnd: new Date(Date.now() + DAYS_FREE_SUBSCRIPTION * 86400000),
      activatedByAdminId: null,
    });

    await this.cache.invalidatePlans();
    return result;
  }
}
