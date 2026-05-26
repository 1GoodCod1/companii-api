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
import { CompanyAuthorizationService } from '../companies/authorization/company-authorization.service';

const SUBSCRIPTION_USAGE_TTL_SEC = 60;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) { }

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
    return this.buildMeResponse(companyId);
  }

  private async buildMeResponse(companyId: string) {
    const subscription = await this.prisma.companySubscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
    if (!subscription) return null;

    const usage = await this.cache.getOrSet(
      this.buildUsageKey(companyId),
      () => {
        return this.computeUsage(companyId);
      },
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

  private async computeUsage(companyId: string): Promise<{
    activeTechnicians: number;
    pendingTechnicianInvites: number;
    interventionsThisMonth: number;
  }> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const now = new Date();
    const rows = await this.prisma.$queryRaw<
      Array<{
        active_technicians: bigint;
        pending_invites: bigint;
        interventions_this_month: bigint;
      }>
    >`
      SELECT
        (SELECT COUNT(*) FROM company_members cm
           WHERE cm.company_id = ${companyId}
             AND cm.status = 'ACTIVE'
             AND cm.role = 'MEMBER') AS active_technicians,
        (SELECT COUNT(*) FROM company_invitations ci
           WHERE ci.company_id = ${companyId}
             AND ci.status = 'PENDING'
             AND ci.role = 'MEMBER'
             AND ci.expires_at > ${now}) AS pending_invites,
        (SELECT COUNT(*) FROM interventions i
           WHERE i.company_id = ${companyId}
             AND i.created_at >= ${startOfMonth}) AS interventions_this_month
    `;

    const row = rows[0] ?? {
      active_technicians: 0n,
      pending_invites: 0n,
      interventions_this_month: 0n,
    };
    return {
      activeTechnicians: Number(row.active_technicians),
      pendingTechnicianInvites: Number(row.pending_invites),
      interventionsThisMonth: Number(row.interventions_this_month),
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

    await this.cache.invalidatePlans();
    return result;
  }
}
