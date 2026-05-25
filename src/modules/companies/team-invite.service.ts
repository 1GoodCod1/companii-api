import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AccountKind, CompanyRole } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../common/rls/rls-system.util';
import { isEmailLogin, normalizePhone, phoneVariants } from '../../common/utils/phone.util';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../shared/database/prisma.service';
import { CompanyAuthorizationService } from './company-authorization.service';

const TEAM_INVITE_TTL_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class TeamInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async createLinkInvite(
    companyId: string,
    role: CompanyRole,
    invitedEmail?: string,
    inviterRole?: CompanyRole,
  ) {
    this.companyAuth.assertInviterCanAssignRole(inviterRole, role);
    await this.companyAuth.assertTeamCapacity(companyId, role);
    const token = `ti_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + TEAM_INVITE_TTL_MS);
    const email = invitedEmail?.trim().toLowerCase();

    const invite = await this.prisma.$transaction(async (tx) => {
      await tx.companyInvitation.updateMany({
        where: {
          companyId,
          status: 'PENDING',
          ...(email ? { invitedEmail: email } : { invitedEmail: null }),
        },
        data: { status: 'EXPIRED' },
      });

      return tx.companyInvitation.create({
        data: {
          companyId,
          role,
          token,
          expiresAt,
          invitedEmail: email ?? null,
        },
        include: {
          company: { select: { name: true, slug: true } },
        },
      });
    });

    const frontendUrl = this.config.get<string>('frontendUrl') || 'http://localhost:5174';
    const inviteUrl = `${frontendUrl}/team/invite?token=${encodeURIComponent(invite.token)}`;

    let emailSent = false;
    if (email) {
      emailSent = await this.email.sendTeamInviteEmail({
        to: email,
        companyName: invite.company.name,
        role: invite.role,
        inviteUrl,
        expiresAt: invite.expiresAt,
      });
    }

    return { ...invite, inviteUrl, emailSent };
  }

  async addDirectMember(
    companyId: string,
    contact: string,
    role: CompanyRole,
    inviterRole?: CompanyRole,
  ) {
    this.companyAuth.assertInviterCanAssignRole(inviterRole, role);
    await this.companyAuth.assertTeamCapacity(companyId, role);
    const trimmed = contact.trim();
    type StaffUser = {
      id: string;
      email: string;
      phone: string | null;
      accountKind: AccountKind;
      isActive: boolean;
    };
    let user: StaffUser | null = null;

    if (isEmailLogin(trimmed)) {
      user = await this.prisma.user.findUnique({
        where: { email: trimmed.toLowerCase() },
        select: { id: true, email: true, phone: true, accountKind: true, isActive: true },
      });
    } else {
      const normalizedPhone = normalizePhone(trimmed);
      if (!normalizedPhone) {
        throw AppErrors.badRequest(AppErrorMessages.VALIDATION_FAILED);
      }
      user = await this.prisma.user.findFirst({
        where: {
          OR: phoneVariants(normalizedPhone).map((variant) => ({ phone: variant })),
        },
        select: { id: true, email: true, phone: true, accountKind: true, isActive: true },
      });
    }

    if (!user) {
      throw AppErrors.notFound(AppErrorMessages.TEAM_MEMBER_NOT_FOUND);
    }
    if (user.accountKind !== 'COMPANY_STAFF') {
      throw AppErrors.conflict(AppErrorMessages.TEAM_INVITE_NOT_COMPANY_STAFF);
    }
    if (!user.isActive) {
      throw AppErrors.conflict(AppErrorMessages.AUTH_ACCOUNT_DISABLED);
    }

    const existing = await this.prisma.companyMember.findUnique({
      where: { companyId_userId: { companyId, userId: user.id } },
    });
    if (existing?.status === 'ACTIVE') {
      throw AppErrors.conflict(AppErrorMessages.TEAM_INVITE_ALREADY_MEMBER);
    }

    const ownerConflict = await this.prisma.company.findFirst({
      where: { ownerUserId: user.id, NOT: { id: companyId } },
    });
    if (ownerConflict) {
      throw AppErrors.conflict(AppErrorMessages.TEAM_MEMBER_OWNER_ELSEWHERE);
    }

    const member = existing
      ? await this.prisma.companyMember.update({
          where: { id: existing.id },
          data: { role, status: 'ACTIVE', joinedAt: new Date(), isActive: true },
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
          },
        })
      : await this.prisma.companyMember.create({
          data: {
            companyId,
            userId: user.id,
            role,
            status: 'ACTIVE',
            joinedAt: new Date(),
            email: user.email,
            phone: user.phone,
          },
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
          },
        });

    await this.prisma.companyInvitation.updateMany({
      where: {
        companyId,
        status: 'PENDING',
        invitedEmail: user.email,
      },
      data: { status: 'ACCEPTED', respondedAt: new Date(), invitedUserId: user.id },
    });

    return member;
  }

  async previewInvite(token: string) {
    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
      const invite = await this.prisma.companyInvitation.findUnique({
        where: { token },
        include: {
          company: { select: { name: true, slug: true } },
        },
      });

      if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
        throw AppErrors.notFound(AppErrorMessages.TEAM_INVITE_INVALID);
      }

      const existingMember = invite.invitedEmail
        ? await this.prisma.user.findUnique({
            where: { email: invite.invitedEmail },
            select: { id: true },
          }).then(async (user) =>
            user
              ? this.prisma.companyMember.findUnique({
                  where: { companyId_userId: { companyId: invite.companyId, userId: user.id } },
                })
              : null,
          )
        : null;

      return {
        token: invite.token,
        expiresAt: invite.expiresAt,
        role: invite.role,
        invitedEmail: invite.invitedEmail,
        companyName: invite.company.name,
        companySlug: invite.company.slug,
        alreadyMember: existingMember?.status === 'ACTIVE',
      };
    });
  }

  async acceptInviteToken(token: string, userId: string) {
    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
      const invite = await this.prisma.companyInvitation.findUnique({
        where: { token },
        include: { company: true },
      });

      if (!invite || invite.status !== 'PENDING' || invite.expiresAt < new Date()) {
        throw AppErrors.notFound(AppErrorMessages.TEAM_INVITE_INVALID);
      }

      this.companyAuth.assertInvitableRole(invite.role);
      await this.companyAuth.assertTeamCapacity(invite.companyId, invite.role);

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.accountKind !== 'COMPANY_STAFF') {
        throw AppErrors.conflict(AppErrorMessages.TEAM_INVITE_NOT_COMPANY_STAFF);
      }
      if (!user.isActive) {
        throw AppErrors.conflict(AppErrorMessages.AUTH_ACCOUNT_DISABLED);
      }
      if (invite.invitedEmail && invite.invitedEmail !== user.email.toLowerCase()) {
        throw AppErrors.conflict(AppErrorMessages.TEAM_INVITE_EMAIL_MISMATCH);
      }

      const ownerConflict = await this.prisma.company.findFirst({
        where: { ownerUserId: userId, NOT: { id: invite.companyId } },
      });
      if (ownerConflict) {
        throw AppErrors.conflict(AppErrorMessages.TEAM_MEMBER_OWNER_ELSEWHERE);
      }

      const existing = await this.prisma.companyMember.findUnique({
        where: { companyId_userId: { companyId: invite.companyId, userId } },
      });
      if (existing?.status === 'ACTIVE') {
        throw AppErrors.conflict(AppErrorMessages.TEAM_INVITE_ALREADY_MEMBER);
      }

      const [member] = await this.prisma.$transaction([
        existing
          ? this.prisma.companyMember.update({
              where: { id: existing.id },
              data: {
                role: invite.role,
                status: 'ACTIVE',
                joinedAt: new Date(),
                isActive: true,
                email: user.email,
                phone: user.phone,
              },
            })
          : this.prisma.companyMember.create({
              data: {
                companyId: invite.companyId,
                userId,
                role: invite.role,
                status: 'ACTIVE',
                joinedAt: new Date(),
                email: user.email,
                phone: user.phone,
              },
            }),
        this.prisma.companyInvitation.update({
          where: { id: invite.id },
          data: { status: 'ACCEPTED', respondedAt: new Date(), invitedUserId: userId },
        }),
      ]);

      return { member, company: invite.company };
    });
  }
}
