import { createHash, randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import type { JwtPayload } from '../types/jwt-payload';

const LOGOUT_SINCE_KEY = (userId: string): string =>
  `companii:auth:logout-since:${userId}`;
const ACTIVE_CACHE_KEY = (userId: string): string =>
  `companii:auth:active:${userId}`;
const LOGOUT_SINCE_TTL_SEC = 24 * 60 * 60;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  signAccessToken(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('jwt.secret'),
      expiresIn: this.config.get('jwt.expiresIn'),
    });
  }

  private static readonly REMEMBER_ME_DAYS = 30;
  private static readonly SESSION_DAYS = 1;

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async generateRefreshToken(
    userId: string,
    rememberMe?: boolean,
  ): Promise<string> {
    const token = randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(token);
    const days = rememberMe
      ? TokenService.REMEMBER_ME_DAYS
      : TokenService.SESSION_DAYS;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    return token;
  }

  async refreshTokens(refreshToken: string, enrich: (p: JwtPayload) => Promise<JwtPayload>) {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record) {
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_INVALID_REFRESH_TOKEN);
    }

    if (record.expiresAt < new Date()) {
      await this.prisma.refreshToken.deleteMany({ where: { id: record.id } });
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_REFRESH_TOKEN_EXPIRED);
    }

    if (!record.user.isActive) {
      await this.prisma.refreshToken.deleteMany({ where: { id: record.id } });
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_ACCOUNT_DISABLED);
    }

    const basePayload: JwtPayload = {
      sub: record.user.id,
      email: record.user.email,
      accountKind: record.user.accountKind,
    };
    const payload = await enrich(basePayload);
    const accessToken = this.signAccessToken(payload);

    const daysValid =
      (record.expiresAt.getTime() - record.createdAt.getTime()) / 86_400_000;
    const rememberMe = daysValid > TokenService.SESSION_DAYS + 0.5;

    await this.prisma.refreshToken.deleteMany({ where: { id: record.id } });
    const newRefreshToken = await this.generateRefreshToken(
      record.user.id,
      rememberMe,
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: payload,
      rememberMe,
    };
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    try {
      await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    } catch (err) {
      this.logger.warn('revokeRefreshToken failed', err);
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    try {
      const client = this.redis.getClient();
      await client.set(
        LOGOUT_SINCE_KEY(userId),
        String(Date.now()),
        'EX',
        LOGOUT_SINCE_TTL_SEC,
      );
      await client.del(ACTIVE_CACHE_KEY(userId));
    } catch (err) {
      this.logger.warn('revokeAllForUser: Redis blacklist write failed', err);
    }
  }
}
