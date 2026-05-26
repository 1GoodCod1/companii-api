import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { CreateAdminCategoryDto, UpdateAdminCategoryDto } from '../dto/admin-category.dto';
import type { CreateAdminCityDto, UpdateAdminCityDto } from '../dto/admin-city.dto';
import { slugifyCatalogName, uniqueCatalogSlug } from '../utils/catalog-slug.util';

@Injectable()
export class AdminReferenceDataService {
  constructor(private readonly prisma: PrismaService) {}

  listCities() {
    return this.prisma.city.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { companies: true } } },
    });
  }

  async createCity(dto: CreateAdminCityDto) {
    const baseSlug = dto.slug?.trim() || slugifyCatalogName(dto.name);
    const slug = await uniqueCatalogSlug(this.prisma, 'city', baseSlug);
    return this.prisma.city.create({
      data: {
        name: dto.name.trim(),
        slug,
        ...(dto.translations ? { translations: dto.translations } : {}),
      },
      include: { _count: { select: { companies: true } } },
    });
  }

  async updateCity(id: string, dto: UpdateAdminCityDto) {
    const existing = await this.prisma.city.findUnique({ where: { id } });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const data: { name?: string; slug?: string; translations?: Record<string, { name?: string }> } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    if (dto.slug?.trim()) {
      data.slug = await uniqueCatalogSlug(this.prisma, 'city', dto.slug.trim(), id);
    } else if (dto.name?.trim()) {
      data.slug = await uniqueCatalogSlug(this.prisma, 'city', slugifyCatalogName(dto.name.trim()), id);
    }
    if (dto.translations) data.translations = dto.translations;

    return this.prisma.city.update({
      where: { id },
      data,
      include: { _count: { select: { companies: true } } },
    });
  }

  async deleteCity(id: string) {
    const city = await this.prisma.city.findUnique({
      where: { id },
      include: { _count: { select: { companies: true } } },
    });
    if (!city) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (city._count.companies > 0) {
      throw AppErrors.conflict(AppErrorMessages.CATALOG_IN_USE);
    }
    await this.prisma.city.delete({ where: { id } });
    return { message: 'City deleted' };
  }

  listCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { companies: true, companyServices: true } } },
    });
  }

  async createCategory(dto: CreateAdminCategoryDto) {
    const baseSlug = dto.slug?.trim() || slugifyCatalogName(dto.name);
    const slug = await uniqueCatalogSlug(this.prisma, 'category', baseSlug);
    return this.prisma.category.create({
      data: {
        name: dto.name.trim(),
        slug,
        ...(dto.translations ? { translations: dto.translations } : {}),
      },
      include: { _count: { select: { companies: true, companyServices: true } } },
    });
  }

  async updateCategory(id: string, dto: UpdateAdminCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const data: { name?: string; slug?: string; translations?: Record<string, { name?: string }> } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    if (dto.slug?.trim()) {
      data.slug = await uniqueCatalogSlug(this.prisma, 'category', dto.slug.trim(), id);
    } else if (dto.name?.trim()) {
      data.slug = await uniqueCatalogSlug(
        this.prisma,
        'category',
        slugifyCatalogName(dto.name.trim()),
        id,
      );
    }
    if (dto.translations) data.translations = dto.translations;

    return this.prisma.category.update({
      where: { id },
      data,
      include: { _count: { select: { companies: true, companyServices: true } } },
    });
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { companies: true, companyServices: true } } },
    });
    if (!category) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (category._count.companies > 0 || category._count.companyServices > 0) {
      throw AppErrors.conflict(AppErrorMessages.CATALOG_IN_USE);
    }
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category deleted' };
  }
}
