import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import {
  AUTH_LOCKOUT_THRESHOLD,
  AUTH_LOCKOUT_TTL_SEC,
  AUTH_LOCKOUT_WINDOW_TTL_SEC,
} from '../../../common/constants';
import { RedisService } from '../../shared/redis/redis.service';

@Injectable()
export class AuthLockoutService {
  private readonly logger = new Logger(AuthLockoutService.name);

  constructor(private readonly redis: RedisService) {}

  private keyEmail(email: string): string {
    return `companii:lockout:email:${email.toLowerCase().trim()}`;
  }

  private keyIp(ip: string): string {
    return `companii:lockout:ip:${ip.trim()}`;
  }

  async checkLocked(email: string, ipAddress?: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      const raw = await client.get(this.keyEmail(email));
      const count = raw !== null ? parseInt(raw, 10) || 0 : 0;
      if (count >= AUTH_LOCKOUT_THRESHOLD) {
        throw AppErrors.forbidden(AppErrorMessages.AUTH_ACCOUNT_LOCKED);
      }

      if (ipAddress) {
        const ipRaw = await client.get(this.keyIp(ipAddress));
        const ipCount = ipRaw !== null ? parseInt(ipRaw, 10) || 0 : 0;
        if (ipCount >= AUTH_LOCKOUT_THRESHOLD * 2) {
          throw AppErrors.forbidden(AppErrorMessages.AUTH_ACCOUNT_LOCKED);
        }
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.warn('Lockout check skipped (Redis unavailable)');
    }
  }

  async recordFailed(email: string | undefined, ipAddress?: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      if (email) {
        const key = this.keyEmail(email);
        const count = await client.incr(key);
        if (count === 1) {
          await client.expire(key, AUTH_LOCKOUT_WINDOW_TTL_SEC);
        }
      }
      if (ipAddress) {
        const key = this.keyIp(ipAddress);
        const count = await client.incr(key);
        if (count === 1) {
          await client.expire(key, AUTH_LOCKOUT_WINDOW_TTL_SEC);
        }
      }
    } catch (err) {
      this.logger.warn('recordFailed lockout skipped', err);
    }
  }

  async clearOnSuccess(email: string, ipAddress?: string): Promise<void> {
    try {
      const client = this.redis.getClient();
      await client.del(this.keyEmail(email));
      if (ipAddress) await client.del(this.keyIp(ipAddress));
    } catch {
      /* ignore */
    }
  }
}
