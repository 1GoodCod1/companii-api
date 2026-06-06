import { Injectable } from '@nestjs/common';
import { CompanyRole, InterventionStatus, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService } from '../../audit/audit.service';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../authorization/company-authorization.service';
import { CacheService } from '../../shared/cache/cache.service';

const ACTIVE_TECHNICIAN_STATUSES: InterventionStatus[] = [
  'NEW',
  'SCHEDULED',
  'EN_ROUTE',
  'IN_PROGRESS',
];

type UserContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

@Injectable()
export class TeamMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAuth: CompanyAuthorizationService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly cache: CacheService,
  ) {}

  async updateMemberRole(user: JwtPayload, memberId: string, role: CompanyRole) {
    this.companyAuth.assertInvitableRole(role);
    this.companyAuth.assertCanManageTeam(user);

    const target = await this.findActiveMember(memberId, user.activeCompanyId!);
    this.companyAuth.assertCanModifyMember(user, target.role, target.userId);

    if (target.role === 'OWNER') {
      throw AppErrors.forbidden(AppErrorMessages.TEAM_MEMBER_CANNOT_CHANGE);
    }

    if (user.companyRole === 'MANAGER' && role === 'MANAGER') {
      throw AppErrors.forbidden(AppErrorMessages.TEAM_INVITE_MANAGER_CANNOT_INVITE_MANAGER);
    }

    const updated = await this.prisma.companyMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, phone: true },
        },
      },
    });

    void this.audit.log({
      userId: user.sub,
      action: AuditAction.TEAM_MEMBER_ROLE_CHANGED,
      entityType: AuditEntityType.Company,
      entityId: user.activeCompanyId!,
      newData: { memberId, role, targetUserId: target.userId },
    });

    await this.cache.invalidateSubscriptionUsage(user.activeCompanyId!);

    return updated;
  }

  async deactivateMember(user: JwtPayload, memberId: string) {
    this.companyAuth.assertCanManageTeam(user);

    const target = await this.findActiveMember(memberId, user.activeCompanyId!);
    this.companyAuth.assertCanModifyMember(user, target.role, target.userId);

    const company = await this.prisma.company.findUnique({
      where: { id: user.activeCompanyId! },
      select: { ownerUserId: true, name: true },
    });
    if (company?.ownerUserId === target.userId) {
      throw AppErrors.forbidden(AppErrorMessages.TEAM_MEMBER_CANNOT_DEACTIVATE);
    }

    const actor = await this.findUserContact(user.sub);
    const targetUser = await this.findUserContact(target.userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.releaseTechnicianAssignments(tx, memberId);
      return tx.companyMember.update({
        where: { id: memberId },
        data: { status: 'LEFT', isActive: false },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, phone: true },
          },
        },
      });
    });

    void this.audit.log({
      userId: user.sub,
      action: AuditAction.TEAM_MEMBER_DEACTIVATED,
      entityType: AuditEntityType.Company,
      entityId: user.activeCompanyId!,
      newData: { memberId, targetUserId: target.userId },
    });

    const emailSent = await this.email.sendTeamMemberDeactivatedEmail({
      to: targetUser.email,
      companyName: company?.name ?? 'Companie',
      actorName: this.displayName(actor),
    });

    await this.cache.invalidateSubscriptionUsage(user.activeCompanyId!);

    return { ...updated, emailSent };
  }

  async leaveCompany(user: JwtPayload) {
    if (!user.memberId || !user.activeCompanyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }
    if (user.companyRole === 'OWNER') {
      throw AppErrors.forbidden(AppErrorMessages.TEAM_OWNER_CANNOT_LEAVE);
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.activeCompanyId },
      select: { ownerUserId: true, name: true },
    });
    if (company?.ownerUserId === user.sub) {
      throw AppErrors.forbidden(AppErrorMessages.TEAM_OWNER_CANNOT_LEAVE);
    }

    const leavingUser = await this.findUserContact(user.sub);
    const ownerUser = company?.ownerUserId ? await this.findUserContact(company.ownerUserId) : null;
    const managers = await this.prisma.companyMember.findMany({
      where: {
        companyId: user.activeCompanyId,
        status: 'ACTIVE',
        role: 'MANAGER',
        userId: { not: user.sub },
      },
      include: { user: { select: { email: true } } },
    });

    await this.prisma.$transaction(async (tx) => {
      await this.releaseTechnicianAssignments(tx, user.memberId!);
      await tx.companyMember.update({
        where: { id: user.memberId },
        data: { status: 'LEFT', isActive: false },
      });
    });

    void this.audit.log({
      userId: user.sub,
      action: AuditAction.TEAM_MEMBER_LEFT,
      entityType: AuditEntityType.Company,
      entityId: user.activeCompanyId,
      newData: { memberId: user.memberId },
    });

    const memberName = this.displayName(leavingUser);
    const companyName = company?.name ?? 'Companie';
    const recipients = [
      ownerUser?.email,
      ...managers.map((manager) => manager.user.email),
    ].filter((email): email is string => Boolean(email));
    const uniqueRecipients = [...new Set(recipients)];

    let emailSent = false;
    for (const to of uniqueRecipients) {
      const sent = await this.email.sendTeamMemberLeftEmail({
        to,
        companyName,
        memberName,
      });
      emailSent = emailSent || sent;
    }

    await this.cache.invalidateSubscriptionUsage(user.activeCompanyId);

    return { success: true, emailSent };
  }

  async revokeInvitation(user: JwtPayload, invitationId: string) {
    this.companyAuth.assertCanManageTeam(user);

    const invite = await this.prisma.companyInvitation.findFirst({
      where: {
        id: invitationId,
        companyId: user.activeCompanyId!,
        status: 'PENDING',
      },
    });
    if (!invite) {
      throw AppErrors.notFound(AppErrorMessages.TEAM_INVITATION_NOT_FOUND);
    }

    const updated = await this.prisma.companyInvitation.update({
      where: { id: invitationId },
      data: { status: 'EXPIRED' },
    });

    void this.audit.log({
      userId: user.sub,
      action: AuditAction.TEAM_INVITATION_REVOKED,
      entityType: AuditEntityType.Company,
      entityId: user.activeCompanyId!,
      newData: { invitationId },
    });

    await this.cache.invalidateSubscriptionUsage(user.activeCompanyId!);

    return updated;
  }

  async transferOwnership(user: JwtPayload, newOwnerUserId: string, companyId?: string) {
    const targetCompanyId = companyId ?? user.activeCompanyId!;
    this.companyAuth.assertSameCompanyContext(user, targetCompanyId);
    await this.companyAuth.assertCompanyOwner(user, targetCompanyId);

    if (newOwnerUserId === user.sub) {
      throw AppErrors.badRequest(AppErrorMessages.VALIDATION_FAILED);
    }

    const newOwnerMember = await this.prisma.companyMember.findFirst({
      where: { companyId: targetCompanyId, userId: newOwnerUserId, status: 'ACTIVE' },
    });
    if (!newOwnerMember) {
      throw AppErrors.notFound(AppErrorMessages.TEAM_MEMBER_NOT_FOUND);
    }

    const currentOwnerMember = await this.prisma.companyMember.findFirst({
      where: { companyId: targetCompanyId, userId: user.sub, status: 'ACTIVE', role: 'OWNER' },
    });
    if (!currentOwnerMember) {
      throw AppErrors.forbidden(AppErrorMessages.TEAM_OWNER_REQUIRED);
    }

    const company = await this.prisma.company.findUnique({
      where: { id: targetCompanyId },
      select: { name: true },
    });

    const previousOwner = await this.findUserContact(user.sub);
    const newOwner = await this.findUserContact(newOwnerUserId);

    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id: targetCompanyId },
        data: { ownerUserId: newOwnerUserId },
      });
      await tx.companyMember.update({
        where: { id: currentOwnerMember.id },
        data: { role: 'MANAGER' },
      });
      await tx.companyMember.update({
        where: { id: newOwnerMember.id },
        data: { role: 'OWNER' },
      });
    });

    void this.audit.log({
      userId: user.sub,
      action: AuditAction.COMPANY_OWNERSHIP_TRANSFERRED,
      entityType: AuditEntityType.Company,
      entityId: targetCompanyId,
      newData: { newOwnerUserId },
    });

    const companyName = company?.name ?? 'Companie';
    const previousOwnerName = this.displayName(previousOwner);
    const newOwnerName = this.displayName(newOwner);

    const [previousOwnerEmailSent, newOwnerEmailSent] = await Promise.all([
      this.email.sendOwnershipTransferredEmail({
        to: previousOwner.email,
        companyName,
        previousOwnerName,
        newOwnerName,
        isNewOwner: false,
      }),
      this.email.sendOwnershipTransferredEmail({
        to: newOwner.email,
        companyName,
        previousOwnerName,
        newOwnerName,
        isNewOwner: true,
      }),
    ]);

    return {
      success: true,
      newOwnerUserId,
      emailSent: previousOwnerEmailSent || newOwnerEmailSent,
    };
  }

  private async releaseTechnicianAssignments(
    tx: Prisma.TransactionClient,
    memberId: string,
  ): Promise<void> {
    await tx.intervention.updateMany({
      where: {
        technicianId: memberId,
        status: { in: ACTIVE_TECHNICIAN_STATUSES },
      },
      data: { technicianId: null },
    });
  }

  private async findActiveMember(memberId: string, companyId: string) {
    const member = await this.prisma.companyMember.findFirst({
      where: { id: memberId, companyId, status: 'ACTIVE' },
    });
    if (!member) {
      throw AppErrors.notFound(AppErrorMessages.TEAM_MEMBER_NOT_FOUND);
    }
    return member;
  }

  private async findUserContact(userId: string): Promise<UserContact> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!user) {
      throw AppErrors.notFound(AppErrorMessages.AUTH_UNAUTHORIZED);
    }
    return user;
  }

  private displayName(user: UserContact): string {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || user.email;
  }

  listMembers(user: JwtPayload) {
    const isTechnician = user.companyRole === 'MEMBER';
    return this.prisma.companyMember.findMany({
      where: {
        companyId: user.activeCompanyId!,
        status: 'ACTIVE',
        ...(isTechnician && user.memberId ? { id: user.memberId } : {}),
      },
      include: {
        user: {
          select: isTechnician
            ? { id: true, firstName: true, lastName: true }
            : {
                id: true,
                email: true,
                phone: true,
                firstName: true,
                lastName: true,
              },
        },
        _count: {
          select: { interventions: true },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  }
}
