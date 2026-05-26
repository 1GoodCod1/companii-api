import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class CompaniesPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  findCities() {
    return this.prisma.city.findMany({
      orderBy: { name: 'asc' },
    });
  }

  findCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  findPublicList(params: {
    cityId?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
  }) {
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

  findBySlug(slug: string) {
    return this.cache.getOrSet(
      this.cache.keys.companyBySlug(slug),
      async () => {
        const company = await this.prisma.company.findFirst({
          where: { slug, isPublished: true, isVerified: true },
          include: {
            city: true,
            category: true,
            members: { where: { status: 'ACTIVE', isActive: true } },
            services: {
              where: { isPublished: true },
              include: { category: { select: { id: true, name: true, slug: true } } },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
            badges: { where: { isActive: true } },
            galleryImages: { orderBy: { sortOrder: 'asc' } },
          },
        });
        if (!company) {
          throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);
        }
        return {
          ...company,
          contactPhone: company.showPublicPhone ? company.contactPhone : null,
          contactEmail: company.showPublicEmail ? company.contactEmail : null,
        };
      },
      this.cache.ttl.companyBySlug,
    );
  }
}
