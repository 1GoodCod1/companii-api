import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CompanySubscriptionPlan } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { REQUIRES_FEATURE_KEY } from '../../../common/decorators/requires-feature.decorator';
import {
  minPlanForFeature,
  type PlanFeatureKey,
} from '../../../common/constants/plan-entitlements.constants';
import { planRank } from '../../../common/constants';
import { rlsContextFromUser } from '../../../common/rls/rls-context.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../types/jwt-payload';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<PlanFeatureKey[]>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeatures?.length) return true;

    const minRequired = this.resolveMinimumPlan(requiredFeatures);

    const user = context.switchToHttp().getRequest<{ user: JwtPayload }>().user;
    const companyId = user.activeCompanyId;
    if (!companyId) throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);

    const sub = await this.prisma.withRlsContext(
      rlsContextFromUser(user, { companyId }),
      (tx) =>
        tx.companySubscription.findUnique({
          where: { companyId },
          include: { plan: true },
        }),
    );
    if (!sub || (sub.status !== 'ACTIVE' && sub.status !== 'TRIAL')) {
      throw AppErrors.forbidden(AppErrorMessages.SUBSCRIPTION_INACTIVE);
    }

    if (planRank(sub.plan.code) < planRank(minRequired)) {
      throw AppErrors.forbidden(AppErrorMessages.SUBSCRIPTION_PLAN_REQUIRED);
    }
    return true;
  }

  private resolveMinimumPlan(
    requiredFeatures: PlanFeatureKey[],
  ): CompanySubscriptionPlan {
    return requiredFeatures.reduce((highest, feature) => {
      const plan = minPlanForFeature(feature);
      return planRank(plan) > planRank(highest) ? plan : highest;
    }, 'FREE' as CompanySubscriptionPlan);
  }
}
