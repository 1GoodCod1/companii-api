import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AppErrors, AppErrorMessages } from '../../common/errors';
import { extractRequestContext } from '../shared/utils/request-context.util';
import { AuditAction } from '../audit/audit-action.enum';
import { AuditEntityType } from '../audit/audit-entity-type.enum';
import { AuditService } from '../audit/audit.service';
import { AccountKind } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../shared/database/prisma.service';
import type { JwtPayload } from './types/jwt-payload';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { TokenService } from './services/token.service';
import { AuthLockoutService } from './services/auth-lockout.service';
import {
  CURRENT_TERMS_VERSION,
  EndClientLinkService,
} from '../portal/end-client-link.service';
import { TeamInviteService } from '../companies/team-invite.service';
import { EmailService } from '../email/email.service';
import { isEmailLogin, normalizePhone, phoneVariants } from '../../common/utils/phone.util';
import { rlsContextFromUserId } from '../../common/rls/rls-context.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
    private readonly lockout: AuthLockoutService,
    private readonly endClientLink: EndClientLinkService,
    private readonly teamInvite: TeamInviteService,
    private readonly email: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, rememberMe?: boolean) {
    if (!dto.acceptTerms) {
      throw AppErrors.badRequest(AppErrorMessages.AUTH_TERMS_REQUIRED);
    }

    let email = dto.email.toLowerCase().trim();
    let normalizedPhone = dto.phone ? normalizePhone(dto.phone) : null;
    let firstName = dto.firstName?.trim();
    let lastName = dto.lastName?.trim();
    const portalInviteToken = dto.portalInviteToken;
    const teamInviteToken = dto.teamInviteToken;

    if (dto.accountKind === 'END_CLIENT' && portalInviteToken) {
      const resolved = await this.endClientLink.resolveRegistrationFromInvite({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        portalInviteToken,
      });
      email = resolved.email;
      normalizedPhone = resolved.phone;
      firstName = resolved.firstName;
      lastName = resolved.lastName;
    }

    if (dto.accountKind === 'COMPANY_STAFF' && teamInviteToken) {
      const preview = await this.teamInvite.previewInvite(teamInviteToken);
      if (preview.invitedEmail && preview.invitedEmail !== email) {
        throw AppErrors.conflict(AppErrorMessages.TEAM_INVITE_EMAIL_MISMATCH);
      }
    }

    if (dto.accountKind === 'END_CLIENT' && !normalizedPhone) {
      throw AppErrors.badRequest(AppErrorMessages.VALIDATION_FAILED);
    }

    const existingEmail = await this.prisma.user.findUnique({ where: { email } });
    if (existingEmail) throw AppErrors.conflict(AppErrorMessages.AUTH_EMAIL_ALREADY_REGISTERED);

    if (normalizedPhone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: {
          OR: phoneVariants(normalizedPhone).map((variant) => ({ phone: variant })),
        },
      });
      if (existingPhone) {
        throw AppErrors.conflict(AppErrorMessages.AUTH_PHONE_ALREADY_REGISTERED);
      }
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        phone: normalizedPhone,
        passwordHash,
        accountKind: dto.accountKind,
        firstName,
        lastName,
        termsAcceptedAt: new Date(),
        termsVersion: CURRENT_TERMS_VERSION,
      },
    });

    if (user.accountKind === 'END_CLIENT') {
      if (portalInviteToken) {
        await this.endClientLink.acceptInviteToken(portalInviteToken, user.id);
      } else {
        await this.endClientLink.linkByContact(user.id, {
          phone: normalizedPhone ?? undefined,
          email,
        });
      }
    }

    if (user.accountKind === 'COMPANY_STAFF' && teamInviteToken) {
      await this.teamInvite.acceptInviteToken(teamInviteToken, user.id);
    }

    const enriched = await this.enrichPayload(this.buildPayload(user));
    const result = await this.issueSession(enriched, rememberMe ?? true);
    void this.audit.log({
      userId: user.id,
      action: AuditAction.USER_REGISTERED,
      entityType: AuditEntityType.User,
      entityId: user.id,
      newData: { email: user.email, accountKind: user.accountKind, phone: user.phone },
    });
    return { ...result, rememberMe: rememberMe ?? true };
  }

  async login(dto: LoginDto, req?: Request) {
    const login = dto.login.trim();
    const ipAddress = req ? extractRequestContext(req).ipAddress : undefined;
    await this.lockout.checkLocked(login, ipAddress);

    const user = await this.findUserByLogin(login);
    if (!user?.passwordHash) {
      await this.lockout.recordFailed(undefined, ipAddress);
      void this.audit.log({
        action: AuditAction.LOGIN_FAILED,
        newData: { login },
      });
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_INVALID_CREDENTIALS);
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      await this.lockout.recordFailed(user.email, ipAddress);
      void this.audit.log({ userId: user.id, action: AuditAction.LOGIN_FAILED });
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_INVALID_CREDENTIALS);
    }
    if (!user.isActive) {
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_ACCOUNT_DISABLED);
    }

    await this.lockout.clearOnSuccess(user.email, ipAddress);
    const result = await this.issueSession(
      await this.enrichPayload(this.buildPayload(user)),
      !!dto.rememberMe,
    );
    void this.audit.log({
      userId: user.id,
      action: AuditAction.LOGIN_SUCCESS,
      entityType: AuditEntityType.User,
      entityId: user.id,
    });
    return result;
  }

  private async findUserByLogin(login: string) {
    if (isEmailLogin(login)) {
      return this.prisma.user.findUnique({ where: { email: login.toLowerCase() } });
    }

    const normalizedPhone = normalizePhone(login);
    if (!normalizedPhone) return null;

    return this.prisma.user.findFirst({
      where: {
        OR: phoneVariants(normalizedPhone).map((variant) => ({ phone: variant })),
      },
    });
  }

  async refresh(refreshToken: string) {
    return this.tokens.refreshTokens(refreshToken, (p) => this.enrichPayload(p));
  }

  async refreshCompanyContext(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    if (!user.isActive) throw AppErrors.unauthorized(AppErrorMessages.AUTH_ACCOUNT_DISABLED);

    const payload = this.buildPayload(user);
    const enriched = await this.enrichPayload(payload);
    return this.issueSession(enriched, true);
  }

  async switchCompany(userId: string, companyId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    if (!user.isActive) throw AppErrors.unauthorized(AppErrorMessages.AUTH_ACCOUNT_DISABLED);
    if (user.accountKind !== 'COMPANY_STAFF' && user.accountKind !== 'PLATFORM_ADMIN') {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }

    const payload = this.buildPayload(user);
    const enriched = await this.enrichPayload(payload, { preferredCompanyId: companyId });
    if (enriched.activeCompanyId !== companyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }

    const result = await this.issueSession(enriched, true);
    void this.audit.log({
      userId,
      action: AuditAction.COMPANY_SWITCHED,
      entityType: AuditEntityType.Company,
      entityId: companyId,
      newData: { companyId },
    });
    return result;
  }

  async logout(refreshToken: string) {
    await this.tokens.revokeRefreshToken(refreshToken);
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string) {
    await this.tokens.revokeAllForUser(userId);
    return { message: 'All sessions logged out' };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        companyMemberships: {
          where: { status: 'ACTIVE' },
          include: { company: true },
        },
        portalCustomer: { include: { company: true } },
        ownedCompanies: true,
      },
    });
    if (!user) throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    return user;
  }

  private buildPayload(user: {
    id: string;
    email: string;
    accountKind: AccountKind;
  }): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      accountKind: user.accountKind,
    };
  }

  private async enrichPayload(
    payload: JwtPayload,
    options?: { preferredCompanyId?: string },
  ): Promise<JwtPayload> {
    return this.prisma.withRlsContext(
      rlsContextFromUserId(payload.sub, payload.accountKind, {
        companyId: options?.preferredCompanyId ?? payload.activeCompanyId,
      }),
      async () => {
        if (payload.accountKind === 'END_CLIENT') {
          const customer = await this.prisma.companyCustomer.findUnique({
            where: { portalUserId: payload.sub },
          });
          if (customer) {
            payload.customerId = customer.id;
            payload.activeCompanyId = customer.companyId;
          }
          return payload;
        }

        const preferredCompanyId = options?.preferredCompanyId ?? payload.activeCompanyId;
        if (preferredCompanyId) {
          const preferredMembership = await this.prisma.companyMember.findFirst({
            where: {
              userId: payload.sub,
              companyId: preferredCompanyId,
              status: 'ACTIVE',
            },
          });
          if (preferredMembership) {
            payload.activeCompanyId = preferredMembership.companyId;
            payload.memberId = preferredMembership.id;
            payload.companyRole = preferredMembership.role;
            return payload;
          }

          const ownedPreferred = await this.prisma.company.findFirst({
            where: { id: preferredCompanyId, ownerUserId: payload.sub },
          });
          if (ownedPreferred) {
            const ownerMembership = await this.prisma.companyMember.findFirst({
              where: {
                companyId: preferredCompanyId,
                userId: payload.sub,
                status: 'ACTIVE',
              },
            });
            payload.activeCompanyId = ownedPreferred.id;
            payload.memberId = ownerMembership?.id;
            payload.companyRole = ownerMembership?.role ?? 'OWNER';
            return payload;
          }
        }

        const membership = await this.prisma.companyMember.findFirst({
          where: { userId: payload.sub, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        });
        if (membership) {
          payload.activeCompanyId = membership.companyId;
          payload.memberId = membership.id;
          payload.companyRole = membership.role;
          return payload;
        }

        const ownedCompany = await this.prisma.company.findFirst({
          where: { ownerUserId: payload.sub },
          orderBy: { createdAt: 'asc' },
        });
        if (ownedCompany) {
          payload.activeCompanyId = ownedCompany.id;
          payload.companyRole = 'OWNER';
        }
        return payload;
      },
    );
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Pentru securitate, întotdeauna întoarcem succes, chiar dacă nu există utilizatorul
    if (!user) {
      return {
        message: 'Dacă adresa de email există în baza de date, a fost trimis un link de resetare.',
      };
    }

    if (!user.isActive) {
      throw AppErrors.badRequest(AppErrorMessages.AUTH_ACCOUNT_DISABLED);
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Valid 1 oră

    // Ștergem token-urile nefolosite anterioare ale acestui utilizator
    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        used: false,
      },
    });

    // Salvăm noul token
    await this.prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    const frontendUrl = this.configService.get<string>('frontendUrl') || this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    await this.email.sendPasswordResetEmail({
      to: user.email,
      resetUrl,
    });

    void this.audit.log({
      userId: user.id,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      entityType: AuditEntityType.User,
      entityId: user.id,
    });

    return {
      message: 'Dacă adresa de email există în baza de date, a fost trimis un link de resetare.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const { token, password } = dto;

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      throw AppErrors.notFound(AppErrorMessages.RESET_TOKEN_INVALID);
    }

    if (resetToken.used) {
      throw AppErrors.badRequest(AppErrorMessages.RESET_TOKEN_USED);
    }

    if (resetToken.expiresAt < new Date()) {
      await this.prisma.passwordResetToken.delete({ where: { id: resetToken.id } });
      throw AppErrors.badRequest(AppErrorMessages.RESET_TOKEN_EXPIRED);
    }

    if (!resetToken.user || !resetToken.user.isActive) {
      throw AppErrors.badRequest(AppErrorMessages.AUTH_ACCOUNT_DISABLED);
    }

    const passwordHash = await argon2.hash(password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });
    });

    // Ștergem restul token-urilor nefolosite ale acestui utilizator
    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: resetToken.userId,
        used: false,
      },
    });

    void this.audit.log({
      userId: resetToken.userId,
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      entityType: AuditEntityType.User,
      entityId: resetToken.userId,
    });

    return {
      message: 'Parola a fost resetată cu succes.',
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    }

    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) {
      throw AppErrors.badRequest('Parola curentă este incorectă.');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Parola a fost modificată cu succes.' };
  }

  private async issueSession(payload: JwtPayload, rememberMe: boolean) {
    const accessToken = this.tokens.signAccessToken(payload);
    const refreshToken = await this.tokens.generateRefreshToken(payload.sub, rememberMe);
    return {
      accessToken,
      refreshToken,
      user: payload,
      rememberMe,
    };
  }
}
