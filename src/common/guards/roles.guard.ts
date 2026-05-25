import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccountKind } from '@prisma/client';
import { AppErrors, AppErrorMessages } from '../errors';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../../modules/auth/types/jwt-payload';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AccountKind[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: JwtPayload }>().user;
    if (!user) {
      throw AppErrors.forbidden(AppErrorMessages.GUARD_USER_NOT_AUTHENTICATED);
    }
    if (!required.includes(user.accountKind)) {
      throw AppErrors.forbidden(AppErrorMessages.GUARD_ACCESS_DENIED);
    }
    return true;
  }
}
