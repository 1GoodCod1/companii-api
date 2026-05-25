import { Injectable } from '@nestjs/common';
import { CompanySubscriptionPlan } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { DAYS_FREE_SUBSCRIPTION, planRank } from '../../common/constants';
import { AuditAction } from '../audit/audit-action.enum';
import { AuditEntityType } from '../audit/audit-entity-type.enum';
import { AuditService } from '../audit/audit.service';
import { CacheService } from '../shared/cache/cache.service';
import { PrismaService } from '../shared/database/prisma.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../companies/company-authorization.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  listPlans() {
    return this.cache.getOrSet(
      this.cache.keys.plansAll(),
      () =>
        this.prisma.companyPlan.findMany({
          orderBy: { price: 'asc' },
        }),
      this.cache.ttl.plansAll,
    );
  }

  me(companyId: string) {
    return this.prisma.companySubscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
  }

  async adminSetPlan(
    companyId: string,
    planCode: CompanySubscriptionPlan,
    adminUserId: string,
  ) {
    const plan = await this.prisma.companyPlan.findUnique({
      where: { code: planCode },
    });
    if (!plan) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const existing = await this.prisma.companySubscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });

    const result = await this.prisma.companySubscription.upsert({
      where: { companyId },
      create: {
        companyId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        activatedByAdminId: adminUserId,
      },
      update: {
        planId: plan.id,
        status: 'ACTIVE',
        activatedByAdminId: adminUserId,
      },
    });
    void this.cache.invalidatePlans();

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

    const plan = await this.prisma.companyPlan.findUnique({
      where: { code: planCode },
    });
    if (!plan) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const sub = await this.prisma.companySubscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
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

    const result = await this.prisma.companySubscription.update({
      where: { companyId },
      data: {
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + DAYS_FREE_SUBSCRIPTION * 86400000),
        activatedByAdminId: null,
      },
      include: { plan: true },
    });

    void this.cache.invalidatePlans();
    return result;
  }
}
