import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CompanySubscriptionPlan } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { REQUIRES_PLAN_KEY } from '../../../common/decorators/requires-plan.decorator';
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
    const required = this.reflector.getAllAndOverride<CompanySubscriptionPlan[]>(
      REQUIRES_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

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

    const order: CompanySubscriptionPlan[] = ['FREE', 'PRO', 'BUSINESS'];
    const current = order.indexOf(sub.plan.code);
    const minRequired = Math.min(...required.map((p) => order.indexOf(p)));
    if (current < minRequired) {
      throw AppErrors.forbidden(AppErrorMessages.SUBSCRIPTION_PLAN_REQUIRED);
    }
    return true;
  }
}
