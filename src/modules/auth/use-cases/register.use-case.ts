import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService } from '../../audit/audit.service';
import { RegisterDto } from '../dto/register.dto';
import { AuthJwtPayloadService } from '../services/auth-jwt-payload.service';
import { AuthSessionService } from '../services/auth-session.service';
import {
  CURRENT_TERMS_VERSION,
  EndClientLinkService,
} from '../../portal/end-client-link.service';
import { TeamInviteService } from '../../companies/team/team-invite.service';
import { normalizePhone, phoneVariants } from '../../../common/utils/phone.util';

@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jwtPayload: AuthJwtPayloadService,
    private readonly session: AuthSessionService,
    private readonly endClientLink: EndClientLinkService,
    private readonly teamInvite: TeamInviteService,
  ) {}

  async execute(dto: RegisterDto, rememberMe?: boolean) {
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

    // Anti-enumeration: when the request is anonymous (no invite token), do NOT
    // leak whether email vs phone is already registered. Return a single generic
    // conflict response. When the user is coming via a portal/team invite the
    // specific mismatch is still surfaced because it is required for UX.
    const isAnonymousRegistration = !portalInviteToken && !teamInviteToken;

    const existingEmail = await this.prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw AppErrors.conflict(
        isAnonymousRegistration
          ? AppErrorMessages.AUTH_REGISTRATION_CONFLICT
          : AppErrorMessages.AUTH_EMAIL_ALREADY_REGISTERED,
      );
    }

    if (normalizedPhone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: {
          OR: phoneVariants(normalizedPhone).map((variant) => ({ phone: variant })),
        },
      });
      if (existingPhone) {
        throw AppErrors.conflict(
          isAnonymousRegistration
            ? AppErrorMessages.AUTH_REGISTRATION_CONFLICT
            : AppErrorMessages.AUTH_PHONE_ALREADY_REGISTERED,
        );
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
    const rememberMeResolved = rememberMe ?? false;
    const enriched = await this.jwtPayload.enrichPayload(
      this.jwtPayload.buildPayload(user),
    );
    const result = await this.session.issue(enriched, rememberMeResolved);
    void this.audit.log({
      userId: user.id,
      action: AuditAction.USER_REGISTERED,
      entityType: AuditEntityType.User,
      entityId: user.id,
      newData: { email: user.email, accountKind: user.accountKind, phone: user.phone },
    });
    return { ...result, rememberMe: rememberMeResolved };
  }
}
