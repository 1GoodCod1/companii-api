import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { SeoUrlKind } from './dto/query-seo-urls.dto';

export type SeoUrlItem = {
  path: string;
  lastmod?: string;
};

export type SeoUrlsPage = {
  items: SeoUrlItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  async getUrls(
    kind: SeoUrlKind,
    page: number,
    limit: number,
  ): Promise<SeoUrlsPage> {
    switch (kind) {
      case SeoUrlKind.COMPANIES:
        return this.getCompanyUrls(page, limit);
      case SeoUrlKind.CATEGORIES:
        return this.getCategoryUrls(page, limit);
      case SeoUrlKind.LANDINGS:
        return this.getLandingUrls(page, limit);
      default: {
        const exhaustive: never = kind;
        throw new Error(`Unknown SEO url kind: ${String(exhaustive)}`);
      }
    }
  }
  private async getCompanyUrls(
    page: number,
    limit: number,
  ): Promise<SeoUrlsPage> {
    const where = { isPublished: true };
    const [total, rows] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items: SeoUrlItem[] = rows.map((c) => ({
      path: `/companies/${c.id}`,
      lastmod: c.updatedAt.toISOString(),
    }));

    return this.buildPage(items, page, limit, total);
  }

  private async getCategoryUrls(
    page: number,
    limit: number,
  ): Promise<SeoUrlsPage> {
    const [total, rows] = await Promise.all([
      this.prisma.category.count(),
      this.prisma.category.findMany({
        select: { slug: true },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items: SeoUrlItem[] = rows.map((c) => ({
      path: `/companies?category=${encodeURIComponent(c.slug)}`,
    }));

    return this.buildPage(items, page, limit, total);
  }
  private async getLandingUrls(
    page: number,
    limit: number,
  ): Promise<SeoUrlsPage> {
    const [categories, cities] = await Promise.all([
      this.prisma.category.findMany({
        select: { slug: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.city.findMany({
        select: { slug: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const all: SeoUrlItem[] = [];
    for (const category of categories) {
      for (const city of cities) {
        const params = new URLSearchParams({
          category: category.slug,
          city: city.slug,
        });
        all.push({ path: `/companies?${params.toString()}` });
      }
    }

    const total = all.length;
    const start = (page - 1) * limit;
    const items = all.slice(start, start + limit);
    return this.buildPage(items, page, limit, total);
  }

  private buildPage(
    items: SeoUrlItem[],
    page: number,
    limit: number,
    total: number,
  ): SeoUrlsPage {
    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
