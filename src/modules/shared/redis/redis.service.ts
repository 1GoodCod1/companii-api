import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isDestroyed = false;

  constructor(private readonly config: ConfigService) {}

  getClient(): Redis {
    if (!this.client) {
      const url = this.config.get<string>('redis.url');
      this.client = new Redis(url ?? 'redis://localhost:6380', {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 10_000,
        retryStrategy: (times) => Math.min(times * 50, 5000),
      });
      this.client.on('error', (err) => {
        if (!this.isDestroyed) {
          this.logger.warn(`Redis error: ${err.message}`);
        }
      });
    }
    return this.client;
  }

  isAvailable(): boolean {
    const c = this.client;
    return (
      !this.isDestroyed &&
      !!c &&
      (c.status === 'ready' || c.status === 'connect')
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      const client = this.getClient();
      await Promise.race([
        client.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis connection timeout')), 10_000),
        ),
      ]);
      this.logger.log('Redis connection verified');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis unavailable: ${msg}`);
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const client = this.getClient();
    const stringValue =
      typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl) {
      await client.setex(key, ttl, stringValue);
    } else {
      await client.set(key, stringValue);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const client = this.getClient();
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async del(key: string): Promise<void> {
    await this.getClient().del(key);
  }

  async incr(key: string): Promise<number> {
    return this.getClient().incr(key);
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.getClient().expire(key, ttl);
  }

  async onModuleDestroy(): Promise<void> {
    this.isDestroyed = true;
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }
}
