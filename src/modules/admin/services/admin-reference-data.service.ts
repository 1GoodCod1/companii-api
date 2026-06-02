import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { ADMIN_REPOSITORY } from '../domain/ports/admin.repository.port';
import type { PrismaAdminRepository } from '../infrastructure/persistence/prisma-admin.repository';
import type { CreateAdminCategoryDto, UpdateAdminCategoryDto } from '@/modules/admin/dto/admin-category.dto';
import type { CreateAdminCityDto, UpdateAdminCityDto } from '@/modules/admin/dto/admin-city.dto';
import { slugifyCatalogName } from '../utils/catalog-slug.util';

@Injectable()
export class AdminReferenceDataService {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: PrismaAdminRepository,
  ) {}

  listCities() {
    return this.adminRepo.listCities();
  }

  async createCity(dto: CreateAdminCityDto) {
    const baseSlug = dto.slug?.trim() || slugifyCatalogName(dto.name);
    const slug = await this.adminRepo.uniqueCitySlug(baseSlug);
    return this.adminRepo.createCity({
      name: dto.name.trim(),
      slug,
      ...(dto.translations ? { translations: dto.translations as Prisma.InputJsonValue } : {}),
    });
  }

  async updateCity(id: string, dto: UpdateAdminCityDto) {
    const existing = await this.adminRepo.findCityById(id);
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const data: { name?: string; slug?: string; translations?: Record<string, { name?: string }> } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    if (dto.slug?.trim()) {
      data.slug = await this.adminRepo.uniqueCitySlug(dto.slug.trim(), id);
    } else if (dto.name?.trim()) {
      data.slug = await this.adminRepo.uniqueCitySlug(slugifyCatalogName(dto.name.trim()), id);
    }
    if (dto.translations) data.translations = dto.translations;

    return this.adminRepo.updateCity(id, data);
  }

  async deleteCity(id: string) {
    const city = await this.adminRepo.findCityById(id);
    if (!city) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (city._count.companies > 0) {
      throw AppErrors.conflict(AppErrorMessages.CATALOG_IN_USE);
    }
    await this.adminRepo.deleteCity(id);
    return { message: 'City deleted' };
  }

  listCategories() {
    return this.adminRepo.listCategories();
  }

  async createCategory(dto: CreateAdminCategoryDto) {
    const baseSlug = dto.slug?.trim() || slugifyCatalogName(dto.name);
    const slug = await this.adminRepo.uniqueCategorySlug(baseSlug);
    return this.adminRepo.createCategory({
      name: dto.name.trim(),
      slug,
      ...(dto.translations ? { translations: dto.translations as Prisma.InputJsonValue } : {}),
    });
  }

  async updateCategory(id: string, dto: UpdateAdminCategoryDto) {
    const existing = await this.adminRepo.findCategoryById(id);
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const data: { name?: string; slug?: string; translations?: Record<string, { name?: string }> } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    if (dto.slug?.trim()) {
      data.slug = await this.adminRepo.uniqueCategorySlug(dto.slug.trim(), id);
    } else if (dto.name?.trim()) {
      data.slug = await this.adminRepo.uniqueCategorySlug(slugifyCatalogName(dto.name.trim()), id);
    }
    if (dto.translations) data.translations = dto.translations;

    return this.adminRepo.updateCategory(id, data);
  }

  async deleteCategory(id: string) {
    const category = await this.adminRepo.findCategoryById(id);
    if (!category) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (category._count.companies > 0 || category._count.companyServices > 0) {
      throw AppErrors.conflict(AppErrorMessages.CATALOG_IN_USE);
    }
    await this.adminRepo.deleteCategory(id);
    return { message: 'Category deleted' };
  }
}
