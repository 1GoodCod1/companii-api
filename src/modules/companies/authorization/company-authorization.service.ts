import { Injectable } from '@nestjs/common';
import { CompanyRole } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

const INVITABLE_ROLES: CompanyRole[] = ['MANAGER', 'MEMBER'];

@Injectable()
export class CompanyAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  assertSameCompanyContext(user: JwtPayload, companyId: string): void {
    if (user.accountKind === 'PLATFORM_ADMIN') return;

    if (user.activeCompanyId !== companyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
  }

  assertCanManageTeam(user: JwtPayload): void {
    if (user.accountKind === 'PLATFORM_ADMIN') return;

    if (user.companyRole !== 'OWNER' && user.companyRole !== 'MANAGER') {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
  }

  assertCanModifyMember(
    user: JwtPayload,
    targetRole: CompanyRole,
    targetUserId: string,
  ): void {
    if (user.accountKind === 'PLATFORM_ADMIN') return;

    if (targetUserId === user.sub) {
      throw AppErrors.forbidden(AppErrorMessages.TEAM_MEMBER_CANNOT_CHANGE);
    }

    if (user.companyRole === 'MANAGER' && targetRole !== 'MEMBER') {
      throw AppErrors.forbidden(AppErrorMessages.TEAM_MEMBER_CANNOT_CHANGE);
    }
  }

  assertInviterCanAssignRole(inviterRole: CompanyRole | undefined, role: CompanyRole): void {
    this.assertInvitableRole(role);
    if (inviterRole === 'MANAGER' && role === 'MANAGER') {
      throw AppErrors.forbidden(AppErrorMessages.TEAM_INVITE_MANAGER_CANNOT_INVITE_MANAGER);
    }
  }

  async assertCompanyOwner(user: JwtPayload, companyId?: string): Promise<void> {
    if (user.accountKind === 'PLATFORM_ADMIN') return;

    const targetCompanyId = companyId ?? user.activeCompanyId;

    if (!targetCompanyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }
    this.assertSameCompanyContext(user, targetCompanyId);

    const company = await this.prisma.company.findUnique({
      where: { id: targetCompanyId },
      select: { ownerUserId: true },
    });
    if (!company) {
      throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);
    }
    if (company.ownerUserId !== user.sub) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const membership = await this.prisma.companyMember.findFirst({
      where: {
        companyId: targetCompanyId,
        userId: user.sub,
        status: 'ACTIVE',
        role: 'OWNER',
      },
    });
    if (!membership) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
  }

  assertInvitableRole(role: CompanyRole): void {
    if (!INVITABLE_ROLES.includes(role)) {
      throw AppErrors.badRequest(AppErrorMessages.VALIDATION_FAILED);
    }
  }

  async assertTeamCapacity(companyId: string, role: CompanyRole): Promise<void> {
    if (role !== 'MEMBER') return;

    const sub = await this.prisma.companySubscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
    const max = sub?.plan.maxTechnicians;
    if (max == null) return;
    const now = new Date();
    const rows = await this.prisma.$queryRaw<
      Array<{ active_members: bigint; pending_invites: bigint }>
    >`
      SELECT
        (SELECT COUNT(*) FROM "CompanyMember" cm
           WHERE cm."companyId" = ${companyId}
             AND cm.status = 'ACTIVE'
             AND cm.role = 'MEMBER') AS active_members,
        (SELECT COUNT(*) FROM "CompanyInvitation" ci
           WHERE ci."companyId" = ${companyId}
             AND ci.status = 'PENDING'
             AND ci.role = 'MEMBER'
             AND ci."expiresAt" > ${now}) AS pending_invites
    `;
    const row = rows[0] ?? { active_members: 0n, pending_invites: 0n };
    const used = Number(row.active_members) + Number(row.pending_invites);
    if (used >= max) {
      throw AppErrors.conflict(AppErrorMessages.TEAM_PLAN_TECHNICIAN_LIMIT);
    }
  }

  async assertInterventionMonthlyLimit(companyId: string, additional = 1): Promise<void> {
    const sub = await this.prisma.companySubscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
    const max = sub?.plan.maxInterventionsPerMonth;
    if (max == null) return;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const count = await this.prisma.intervention.count({
      where: {
        companyId,
        createdAt: { gte: startOfMonth },
      },
    });

    if (count + additional > max) {
      throw AppErrors.conflict(AppErrorMessages.PLAN_INTERVENTION_LIMIT);
    }
  }
}