import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppErrors, AppErrorMessages } from '../errors';
import { getCorsOrigins } from '../../config';

@Injectable()
export class CookieOriginGuard implements CanActivate {
  private static cachedAllowed: Set<string> | null = null;

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.get<boolean>('security.cookieOriginCheckEnabled')) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return true;
    }

    const cookieName =
      this.config.get<string>('auth.refreshCookieName') ?? 'companii_refresh';
    const hasRefreshCookie =
      !!req.cookies?.[cookieName] || !!req.cookies?.[`__Host-${cookieName}`];
    const hasBearer =
      typeof req.headers.authorization === 'string' &&
      req.headers.authorization.startsWith('Bearer ');

    if (!hasRefreshCookie && !hasBearer) {
      return true;
    }

    const origin =
      (typeof req.headers.origin === 'string' && req.headers.origin) ||
      this.refererToOrigin(req.headers.referer);

    if (!origin || !this.allowedOrigins().has(this.canonical(origin))) {
      throw AppErrors.forbidden(AppErrorMessages.GUARD_INVALID_ORIGIN);
    }
    return true;
  }

  private allowedOrigins(): Set<string> {
    if (!CookieOriginGuard.cachedAllowed) {
      const raw = getCorsOrigins();
      CookieOriginGuard.cachedAllowed = new Set(
        (Array.isArray(raw) ? raw : [raw]).map((o) => this.canonical(o)),
      );
    }
    return CookieOriginGuard.cachedAllowed;
  }

  private canonical(origin: string): string {
    try {
      return new URL(origin).origin;
    } catch {
      return origin.replace(/\/$/, '');
    }
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
