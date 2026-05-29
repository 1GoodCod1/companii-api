import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import {
  AUTH_LOCKOUT_THRESHOLD,
  AUTH_LOCKOUT_TTL_SEC,
  AUTH_LOCKOUT_WINDOW_TTL_SEC,
} from '../../../common/constants';
import { isEmailLogin, normalizePhone } from '../../../common/utils/phone.util';
import { RedisService } from '../../shared/redis/redis.service';

function canonicalIdentifier(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isEmailLogin(trimmed)) return trimmed.toLowerCase();
  const normalized = normalizePhone(trimmed);
  if (normalized) return normalized;
  return trimmed.toLowerCase();
}

@Injectable()
export class AuthLockoutService {
  private readonly logger = new Logger(AuthLockoutService.name);

  constructor(private readonly redis: RedisService) {}

  private keyCount(id: string): string {
    return `companii:lockout:id:${id}`;
  }

  private keyLocked(id: string): string {
    return `companii:lockout:locked:id:${id}`;
  }

  private keyIp(ip: string): string {
    return `companii:lockout:ip:${ip.trim()}`;
  }

  private keyIpLocked(ip: string): string {
    return `companii:lockout:locked:ip:${ip.trim()}`;
  }

  async checkLocked(rawLogin: string | undefined, ipAddress?: string): Promise<void> {
    const id = canonicalIdentifier(rawLogin);
    try {
      const client = this.redis.getClient();

      if (id) {
        const locked = await client.get(this.keyLocked(id));
        if (locked) {
          throw AppErrors.forbidden(AppErrorMessages.AUTH_ACCOUNT_LOCKED);
        }
        const raw = await client.get(this.keyCount(id));
        const count = raw !== null ? parseInt(raw, 10) || 0 : 0;
        if (count >= AUTH_LOCKOUT_THRESHOLD) {
          throw AppErrors.forbidden(AppErrorMessages.AUTH_ACCOUNT_LOCKED);
        }
      }

      if (ipAddress) {
        const ipLocked = await client.get(this.keyIpLocked(ipAddress));
        if (ipLocked) {
          throw AppErrors.forbidden(AppErrorMessages.AUTH_ACCOUNT_LOCKED);
        }
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

  async recordFailed(rawLogin: string | undefined, ipAddress?: string): Promise<void> {
    const id = canonicalIdentifier(rawLogin);
    try {
      const client = this.redis.getClient();
      if (id) {
        const key = this.keyCount(id);
        const count = await client.incr(key);
        if (count === 1) {
          await client.expire(key, AUTH_LOCKOUT_WINDOW_TTL_SEC);
        }
        if (count >= AUTH_LOCKOUT_THRESHOLD) {
          await client.set(this.keyLocked(id), '1', 'EX', AUTH_LOCKOUT_TTL_SEC);
        }
      }
      if (ipAddress) {
        const key = this.keyIp(ipAddress);
        const count = await client.incr(key);
        if (count === 1) {
          await client.expire(key, AUTH_LOCKOUT_WINDOW_TTL_SEC);
        }
        if (count >= AUTH_LOCKOUT_THRESHOLD * 2) {
          await client.set(this.keyIpLocked(ipAddress), '1', 'EX', AUTH_LOCKOUT_TTL_SEC);
        }
      }
    } catch (err) {
      this.logger.warn('recordFailed lockout skipped', err);
    }
  }

  async clearOnSuccess(rawLogin: string | undefined, ipAddress?: string): Promise<void> {
    const id = canonicalIdentifier(rawLogin);
    try {
      const client = this.redis.getClient();
      if (id) {
        await client.del(this.keyCount(id), this.keyLocked(id));
      }
      if (ipAddress) {
        await client.del(this.keyIp(ipAddress), this.keyIpLocked(ipAddress));
      }
    } catch {
      /* ignore */
    }
  }
}
