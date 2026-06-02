import { Injectable } from '@nestjs/common';
import { CacheService } from '../../../shared/cache/cache.service';
import { PrismaService } from '../../../shared/database/prisma.service';

@Injectable()
export class ListBlueprintsQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async execute() {
    return await this.cache.getOrSet(
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
}