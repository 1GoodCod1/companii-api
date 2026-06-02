import { Inject, Injectable } from '@nestjs/common';
import { SEO_REPOSITORY } from './domain/ports/seo.repository.port';
import type { PrismaSeoRepository } from './infrastructure/persistence/prisma-seo.repository';
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

const SEO_LOCALES = ['ro', 'ru'] as const;

@Injectable()
export class SeoService {
  constructor(
    @Inject(SEO_REPOSITORY)
    private readonly seoRepo: PrismaSeoRepository,
  ) {}

  async getUrls(
    kind: SeoUrlKind,
    page: number,
    limit: number,
  ): Promise<SeoUrlsPage> {
    switch (kind) {
      case SeoUrlKind.COMPANIES:
        return await this.getCompanyUrls(page, limit);
      case SeoUrlKind.CATEGORIES:
        return await this.getCategoryUrls(page, limit);
      case SeoUrlKind.LANDINGS:
        return await this.getLandingUrls(page, limit);
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
    const rows = await this.seoRepo.getPublishedCompanies();

    const all: SeoUrlItem[] = [];
    for (const locale of SEO_LOCALES) {
      for (const company of rows) {
        if (!company.slug) continue;
        all.push({
          path: `/${locale}/companies/${encodeURIComponent(company.slug)}`,
          lastmod: company.updatedAt.toISOString(),
        });
      }
    }

    return this.buildPage(all, page, limit, all.length);
  }

  private async getCategoryUrls(
    page: number,
    limit: number,
  ): Promise<SeoUrlsPage> {
    const rows = await this.seoRepo.getCategories();

    const all: SeoUrlItem[] = [];
    for (const locale of SEO_LOCALES) {
      for (const category of rows) {
        all.push({
          path: `/${locale}/companies?category=${encodeURIComponent(category.slug)}`,
        });
      }
    }

    return this.buildPage(all, page, limit, all.length);
  }

  private async getLandingUrls(
    page: number,
    limit: number,
  ): Promise<SeoUrlsPage> {
    const [categories, cities] = await Promise.all([
      this.seoRepo.getCategories(),
      this.seoRepo.getCities(),
    ]);

    const all: SeoUrlItem[] = [];
    for (const locale of SEO_LOCALES) {
      for (const category of categories) {
        for (const city of cities) {
          const params = new URLSearchParams({
            category: category.slug,
            city: city.slug,
          });
          all.push({ path: `/${locale}/companies?${params.toString()}` });
        }
      }
    }

    return this.buildPage(all, page, limit, all.length);
  }

  private buildPage(
    items: SeoUrlItem[],
    page: number,
    limit: number,
    total: number,
  ): SeoUrlsPage {
    const start = (page - 1) * limit;
    const pageItems = items.slice(start, start + limit);
    return {
      items: pageItems,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
