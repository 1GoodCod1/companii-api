import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { SeoRepository } from '../../domain/ports/seo.repository.port';

@Injectable()
export class PrismaSeoRepository implements SeoRepository {
  constructor(private readonly prisma: PrismaService) {}

  getPublishedCompanies() {
    return this.prisma.company.findMany({
      where: { isPublished: true, isVerified: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  getCategories() {
    return this.prisma.category.findMany({
      select: { slug: true },
      orderBy: { name: 'asc' },
    });
  }

  getCities() {
    return this.prisma.city.findMany({
      select: { slug: true },
      orderBy: { name: 'asc' },
    });
  }
}
