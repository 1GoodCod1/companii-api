import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import type { JwtPayload } from '../types/jwt-payload';

const ACTIVE_CACHE_TTL_SEC = 30;
const LOGOUT_SINCE_KEY = (userId: string): string =>
  `companii:auth:logout-since:${userId}`;
const ACTIVE_CACHE_KEY = (userId: string): string =>
  `companii:auth:active:${userId}`;

function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('jwt.secret');
  if (!secret || secret.trim().length === 0 || secret === 'dev-secret') {
    throw new Error(
      'JWT_SECRET is required. Set JWT_SECRET ',
    );
  }
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (await this.isRevokedByLogoutAll(payload)) {
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    }
    if (!(await this.isActiveUser(payload.sub))) {
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    }
    return payload;
  }

  private async isRevokedByLogoutAll(payload: JwtPayload): Promise<boolean> {
    if (!payload.iat) return false;
    try {
      const client = this.redis.getClient();
      const raw = await client.get(LOGOUT_SINCE_KEY(payload.sub));
      if (!raw) return false;
      const cutoffMs = parseInt(raw, 10);
      if (!Number.isFinite(cutoffMs)) return false;
      return payload.iat * 1000 < cutoffMs;
    } catch {
      return false;
    }
  }

  private async isActiveUser(userId: string): Promise<boolean> {
    try {
      const client = this.redis.getClient();
      const cached = await client.get(ACTIVE_CACHE_KEY(userId));
      if (cached === '1') return true;
      if (cached === '0') return false;
    } catch {
      /* Redis unavailable → fall through to DB */
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    const active = !!user?.isActive;

    try {
      await this.redis
        .getClient()
        .set(ACTIVE_CACHE_KEY(userId), active ? '1' : '0', 'EX', ACTIVE_CACHE_TTL_SEC);
    } catch {
      /* ignore */
    }
    return active;
  }
}
