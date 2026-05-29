import { Injectable } from '@nestjs/common';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class FindCategoriesUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  execute() {
    return this.cache.getOrSet(
      this.cache.keys.categoriesList(),
      () =>
        this.prisma.category.findMany({
          orderBy: { name: 'asc' },
        }),
      this.cache.ttl.categoriesList,
    );
  }
}
