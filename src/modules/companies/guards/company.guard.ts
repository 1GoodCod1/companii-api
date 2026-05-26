import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CompanyRole } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { rlsContextFromUser } from '../../../common/rls/rls-context.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

export const COMPANY_ROLES_KEY = 'company_roles';

export interface CompanyContext {
  companyId: string;
  memberId: string;
  role: CompanyRole;
}

export const COMPANY_CONTEXT_KEY = 'companyContext';

@Injectable()
export class CompanyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<CompanyRole[]>(
      COMPANY_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const req = context.switchToHttp().getRequest<{
      user: JwtPayload;
      headers: Record<string, string | string[] | undefined>;
      [COMPANY_CONTEXT_KEY]?: CompanyContext;
    }>();
    const user = req.user;
    if (user.accountKind === 'PLATFORM_ADMIN') return true;

    const companyId =
      (req.headers['x-company-id'] as string) || user.activeCompanyId;
    if (!companyId) throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);

    const member = await this.prisma.withRlsContext(
      rlsContextFromUser(user, { companyId }),
      (tx) =>
        tx.companyMember.findFirst({
          where: { companyId, userId: user.sub, status: 'ACTIVE' },
        }),
    );
    if (!member) throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);

    if (roles?.length && !roles.includes(member.role)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    req[COMPANY_CONTEXT_KEY] = {
      companyId,
      memberId: member.id,
      role: member.role,
    };
    user.activeCompanyId = companyId;
    user.memberId = member.id;
    user.companyRole = member.role;
    return true;
  }
}
