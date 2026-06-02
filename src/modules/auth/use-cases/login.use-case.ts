import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import * as argon2 from 'argon2';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import { extractRequestContext } from '../../shared/utils/request-context.util';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService } from '../../audit/audit.service';
import { LoginDto } from '@/modules/auth/dto/login.dto';
import { AuthLockoutService } from '../services/auth-lockout.service';
import { AuthJwtPayloadService } from '../services/auth-jwt-payload.service';
import { AuthSessionService } from '../services/auth-session.service';
import { AuthUserLookupService } from '../services/auth-user-lookup.service';

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly audit: AuditService,
    private readonly lockout: AuthLockoutService,
    private readonly jwtPayload: AuthJwtPayloadService,
    private readonly session: AuthSessionService,
    private readonly userLookup: AuthUserLookupService,
  ) {}

  async execute(dto: LoginDto, req?: Request) {
    const login = dto.login.trim();
    const ipAddress = req ? extractRequestContext(req).ipAddress : undefined;
    await this.lockout.checkLocked(login, ipAddress);

    const user = await this.userLookup.findByLogin(login);
    if (!user?.passwordHash) {
      await this.lockout.recordFailed(login, ipAddress);
      void this.audit.log({
        action: AuditAction.LOGIN_FAILED,
        newData: { login },
      });
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_INVALID_CREDENTIALS);
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      await this.lockout.recordFailed(login, ipAddress);
      void this.audit.log({ userId: user.id, action: AuditAction.LOGIN_FAILED });
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_INVALID_CREDENTIALS);
    }
    if (!user.isActive) {
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_ACCOUNT_DISABLED);
    }

    await this.lockout.clearOnSuccess(login, ipAddress);
    const result = await this.session.issue(
      await this.jwtPayload.enrichPayload(this.jwtPayload.buildPayload(user)),
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
}
