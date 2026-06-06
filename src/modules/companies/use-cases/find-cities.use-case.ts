import { Injectable } from '@nestjs/common';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class FindCitiesUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  execute() {
    return this.cache.getOrSet(
      this.cache.keys.citiesList(),
      () =>
        this.prisma.city.findMany({
          orderBy: { name: 'asc' },
        }),
      this.cache.ttl.citiesList,
    );
  }
}
