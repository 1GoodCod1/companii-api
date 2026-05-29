import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';

export type FindPublicListParams = {
  cityId?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class FindPublicListUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  execute(params: FindPublicListParams) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 50);
    const cacheKey = this.cache.keys.companiesList({
      cityId: params.cityId,
      categoryId: params.categoryId,
      page,
      limit,
    });
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const where: Prisma.CompanyWhereInput = {
          isPublished: true,
          isVerified: true,
          ...(params.cityId ? { cityId: params.cityId } : {}),
          ...(params.categoryId ? { categoryId: params.categoryId } : {}),
        };
        const [items, total] = await this.prisma.inSerial([
          () =>
            this.prisma.company.findMany({
              where,
              skip: (page - 1) * limit,
              take: limit,
              include: {
                city: true,
                category: true,
                galleryImages: { orderBy: { sortOrder: 'asc' }, take: 1 },
              },
              orderBy: { rating: 'desc' },
            }),
          () => this.prisma.company.count({ where }),
        ]);
        const filteredItems = items.map((item) => ({
          ...item,
          contactPhone: item.showPublicPhone ? item.contactPhone : null,
          contactEmail: item.showPublicEmail ? item.contactEmail : null,
        }));
        return { items: filteredItems, total, page, limit };
      },
      this.cache.ttl.companiesList,
    );
  }
}
