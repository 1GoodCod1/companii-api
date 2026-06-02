import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import type { CompaniiCacheKeyBuilders } from './cache.types';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly defaultTTL = 300;
  private readonly inFlightRequests = new Map<string, Promise<unknown>>();

  constructor(private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis.isAvailable()) return null;
    try {
      return await this.redis.get<T>(key);
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    if (!this.redis.isAvailable()) return;
    try {
      const effectiveTtl = ttl ?? this.defaultTTL;
      await this.redis.set(key, value, effectiveTtl);
      void this.registerKeyInSet(key, effectiveTtl).catch(() => {});
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.redis.isAvailable()) return;
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Cache del error for key ${key}:`, error);
    }
  }

  private async registerKeyInSet(key: string, dataTtl?: number): Promise<void> {
    const client = this.redis.getClient();
    const lastColon = key.lastIndexOf(':');
    if (lastColon < 0) return;
    const prefix = key.slice(0, lastColon);
    const setName = `keyset:${prefix}:*`;
    const keysetTtl = Math.min(
      Math.max((dataTtl ?? this.defaultTTL) * 2, 3600),
      86400,
    );
    await client.sadd(setName, key);
    await client.expire(setName, keysetTtl);
  }

  async delByPattern(pattern: string): Promise<number> {
    if (!this.redis.isAvailable()) return 0;
    try {
      const client = this.redis.getClient();
      const setName = `keyset:${pattern}`;
      const keys: string[] = await client.smembers(setName);

      if (keys.length === 0) {
        let cursor = '0';
        do {
          const [nextCursor, foundKeys] = await client.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100,
          );
          cursor = nextCursor;
          keys.push(...foundKeys);
        } while (cursor !== '0');
      }

      if (keys.length === 0) return 0;

      const batchSize = 100;
      let deleted = 0;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        await client.del(...batch);
        deleted += batch.length;
      }
      await client.del(setName);
      return deleted;
    } catch (error) {
      this.logger.error(
        `Cache delByPattern error for pattern ${pattern}:`,
        error,
      );
      return 0;
    }
  }

  async invalidate(pattern: string): Promise<number> {
    return await this.delByPattern(pattern);
  }

  async invalidateWithLeafKey(
    leafKey: string,
    pattern: string,
  ): Promise<number> {
    const [, patternDeleted] = await Promise.all([
      this.del(leafKey),
      this.invalidate(pattern),
    ]);
    return patternDeleted;
  }

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const inFlight = this.inFlightRequests.get(key) as Promise<T> | undefined;
    if (inFlight) return inFlight;

    const promise = (async () => {
      const value = await fetchFn();
      await this.set(key, value, ttl ?? this.defaultTTL);
      return value;
    })();

    this.inFlightRequests.set(key, promise as Promise<unknown>);
    try {
      return await promise;
    } finally {
      this.inFlightRequests.delete(key);
    }
  }

  buildKey(parts: (string | number | null | undefined)[]): string {
    return parts
      .filter((p) => p !== null && p !== undefined)
      .map(String)
      .join(':');
  }

  readonly patterns = {
    companiesList: () => 'cache:companii:companies:list:*',
    servicesList: () => 'cache:companii:services:list:*',
    blueprintsAll: () => 'cache:companii:estimates:blueprints:*',
    blueprintByCategorySlug: () => 'cache:companii:estimates:blueprints:by-slug:*',
    categoriesList: () => 'cache:companii:categories:list:*',
  } as const;

  readonly keys: CompaniiCacheKeyBuilders = {
    companiesList: (params) =>
      this.buildKey([
        'cache',
        'companii',
        'companies',
        'list',
        params.cityId ?? 'null',
        params.categoryId ?? 'null',
        params.page,
        params.limit,
      ]),
    companyBySlug: (slug) =>
      this.buildKey(['cache', 'companii', 'company', 'slug', slug]),
    servicesList: (companySlug) =>
      this.buildKey([
        'cache',
        'companii',
        'services',
        'list',
        companySlug ?? 'all',
      ]),
    plansAll: () => this.buildKey(['cache', 'companii', 'plans', 'all']),
    blueprintsAll: () =>
      this.buildKey(['cache', 'companii', 'estimates', 'blueprints', 'all']),
    blueprintByCategorySlug: (slug: string) =>
      this.buildKey([
        'cache',
        'companii',
        'estimates',
        'blueprints',
        'by-slug',
        slug,
      ]),
    categoriesList: () =>
      this.buildKey(['cache', 'companii', 'categories', 'list']),
  };

  readonly ttl = {
    companiesList: 120,
    companyBySlug: 180,
    servicesList: 120,
    plansAll: 3600,
    blueprintsAll: 300,
    blueprintByCategorySlug: 300,
    categoriesList: 300,
  } as const;

  async invalidatePublicCompanies(slug?: string): Promise<void> {
    const tasks: Promise<unknown>[] = [
      this.invalidate(this.patterns.companiesList()),
    ];
    if (slug) tasks.push(this.del(this.keys.companyBySlug(slug)));
    await Promise.all(tasks);
  }

  async invalidatePublicServices(slug?: string): Promise<void> {
    if (slug) {
      await this.del(this.keys.servicesList(slug));
      await this.del(this.keys.companyBySlug(slug));
      return;
    }
    await this.invalidate(this.patterns.servicesList());
  }

  async invalidatePlans(): Promise<void> {
    await this.del(this.keys.plansAll());
  }
}
