import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CacheService } from '../../../shared/cache/cache.service';

@Injectable()
export class EstimateBlueprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list() {
    return this.cache.getOrSet(
      this.cache.keys.blueprintsAll(),
      () =>
        this.prisma.estimateBlueprint.findMany({
          where: { isActive: true },
          include: { category: { select: { id: true, name: true, slug: true } } },
          orderBy: { name: 'asc' },
        }),
      this.cache.ttl.blueprintsAll,
    );
  }

  async getByCategorySlug(slug: string) {
    const result = await this.cache.getOrSet(
      this.cache.keys.blueprintByCategorySlug(slug),
      async () => {
        const blueprint = await this.prisma.estimateBlueprint.findFirst({
          where: { category: { slug }, isActive: true },
          include: { category: { select: { id: true, name: true, slug: true } } },
        });
        if (!blueprint) return { __not_found: true };
        return blueprint;
      },
      this.cache.ttl.blueprintByCategorySlug,
    );
    if (result && typeof result === 'object' && '__not_found' in result) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }
    return result;
  }
}
