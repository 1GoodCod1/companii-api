import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppErrors, AppErrorMessages } from '../errors';
import { getCorsOrigins } from '../../config';

@Injectable()
export class CookieOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.get<boolean>('security.cookieOriginCheckEnabled')) {
      return true;
    }
    if (!this.config.get<boolean>('auth.useHttpOnlyCookie')) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return true;
    }

    const cookieName =
      this.config.get<string>('auth.refreshCookieName') ?? 'companii_refresh';
    if (!req.cookies?.[cookieName]) {
      return true;
    }

    const origin =
      (typeof req.headers.origin === 'string' && req.headers.origin) ||
      this.refererToOrigin(req.headers.referer);

    const allowed = new Set(getCorsOrigins().map((o) => o.replace(/\/$/, '')));
    if (!origin || !allowed.has(origin.replace(/\/$/, ''))) {
      throw AppErrors.forbidden(AppErrorMessages.GUARD_INVALID_ORIGIN);
    }
    return true;
  }

  private refererToOrigin(referer: string | undefined): string | undefined {
    if (!referer) return undefined;
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
}
