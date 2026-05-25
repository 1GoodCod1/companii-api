import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AppErrors, AppErrorMessages } from '../../../common/errors';

@Injectable()
export class RefreshCookieService {
  constructor(private readonly configService: ConfigService) {}

  get isEnabled(): boolean {
    return !!this.configService.get<boolean>('auth.useHttpOnlyCookie');
  }

  private get cookieName(): string {
    return (
      this.configService.get<string>('auth.refreshCookieName') ||
      'companii_refresh'
    );
  }

  private authCookieEnv(): {
    setBase: {
      httpOnly: true;
      secure: boolean;
      sameSite: 'lax';
      path: string;
      domain?: string;
    };
    clearBase: {
      path: string;
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'lax';
      domain?: string;
    };
  } {
    const isProd = this.configService.get<string>('nodeEnv') === 'production';
    const domain =
      this.configService.get<string>('auth.cookieDomain') || undefined;
    const withDomain = domain ? { domain } : {};
    return {
      setBase: {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        ...withDomain,
      },
      clearBase: {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        ...withDomain,
      },
    };
  }

  getTokenOrThrow(req: Request, bodyToken?: string): string {
    const token = this.getToken(req, bodyToken);
    if (!token) {
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_REFRESH_TOKEN_REQUIRED);
    }
    return token;
  }

  getToken(req: Request, bodyToken?: string): string | undefined {
    const fromBody = bodyToken?.trim();
    if (fromBody) return fromBody;
    if (this.isEnabled && req.cookies?.[this.cookieName]) {
      const value = req.cookies[this.cookieName] as string | undefined;
      return typeof value === 'string' ? value : undefined;
    }
    return undefined;
  }

  private static readonly REMEMBER_ME_DAYS = 30;
  private static readonly SESSION_DAYS = 1;

  attachIfEnabled(res: Response, token: string, rememberMe?: boolean): void {
    if (!this.isEnabled || !token) return;
    const { setBase } = this.authCookieEnv();
    const days = rememberMe
      ? RefreshCookieService.REMEMBER_ME_DAYS
      : RefreshCookieService.SESSION_DAYS;
    const maxAgeMs = days * 24 * 60 * 60 * 1000;

    res.cookie(this.cookieName, token, {
      ...setBase,
      maxAge: maxAgeMs,
      expires: new Date(Date.now() + maxAgeMs),
    });
  }

  clearIfEnabled(res: Response): void {
    if (!this.isEnabled) return;
    const { clearBase } = this.authCookieEnv();
    res.clearCookie(this.cookieName, clearBase);
  }

  stripRefreshFromPayload<T extends { refreshToken?: string }>(
    payload: T,
  ): Omit<T, 'refreshToken'> {
    if (!this.isEnabled || !payload.refreshToken) return payload;
    const { refreshToken: _rt, ...rest } = payload;
    void _rt;
    return rest;
  }

  handleAuthSuccess<
    T extends { refreshToken?: string; rememberMe?: boolean },
  >(result: T, res: Response): Omit<T, 'refreshToken' | 'rememberMe'> {
    this.attachIfEnabled(res, result.refreshToken ?? '', result.rememberMe);
    const { rememberMe: _rm, ...withoutRememberMe } = result;
    void _rm;
    return this.stripRefreshFromPayload(withoutRememberMe) as Omit<
      T,
      'refreshToken' | 'rememberMe'
    >;
  }

  async handleLogout(
    req: Request,
    res: Response,
    bodyToken: string | undefined,
    logoutFn: (token: string) => Promise<unknown>,
  ): Promise<{ message: string }> {
    const token = this.getToken(req, bodyToken);
    if (token) await logoutFn(token);
    this.clearIfEnabled(res);
    return { message: 'Logged out successfully' };
  }
}
