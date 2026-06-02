import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { CacheService } from '../../shared/cache/cache.service';
import { ADMIN_REPOSITORY } from '../domain/ports/admin.repository.port';
import type { PrismaAdminRepository } from '../infrastructure/persistence/prisma-admin.repository';
import type { CreateAdminBlueprintDto, UpdateAdminBlueprintDto } from '@/modules/admin/dto/admin-blueprint.dto';

@Injectable()
export class AdminBlueprintsService {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: PrismaAdminRepository,
    private readonly cache: CacheService,
  ) {}

  list() {
    return this.adminRepo.listBlueprints();
  }

  async create(dto: CreateAdminBlueprintDto) {
    const category = await this.adminRepo.findCategoryById(dto.categoryId);
    if (!category) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }

    const existing = await this.adminRepo.findBlueprintByCategoryId(dto.categoryId);
    if (existing) {
      throw AppErrors.conflict('This category already has an estimate blueprint');
    }

    const blueprint = await this.adminRepo.createBlueprint({
      categoryId: dto.categoryId,
      name: dto.name.trim(),
      version: dto.version ?? 1,
      config: dto.config as Prisma.InputJsonValue,
      isActive: dto.isActive !== false,
    });

    await this.invalidateCache(category.slug);
    return blueprint;
  }

  async update(id: string, dto: UpdateAdminBlueprintDto) {
    const existing = await this.adminRepo.findBlueprintById(id);
    if (!existing) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }

    const data: Prisma.EstimateBlueprintUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.version !== undefined) data.version = dto.version;
    if (dto.config !== undefined) data.config = dto.config as Prisma.InputJsonValue;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const blueprint = await this.adminRepo.updateBlueprint(id, data);

    await this.invalidateCache(existing.category.slug);
    if (existing.category.slug !== blueprint.category.slug) {
      await this.invalidateCache(blueprint.category.slug);
    }
    return blueprint;
  }

  async delete(id: string) {
    const blueprint = await this.adminRepo.findBlueprintById(id);
    if (!blueprint) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }

    if (blueprint._count.projects > 0) {
      throw AppErrors.conflict('Cannot delete a blueprint that is in use by estimate projects');
    }

    await this.adminRepo.deleteBlueprint(id);
    await this.invalidateCache(blueprint.category.slug);
    return { message: 'Blueprint deleted' };
  }

  private async invalidateCache(slug: string) {
    await Promise.all([
      this.cache.del(this.cache.keys.blueprintsAll()),
      this.cache.del(this.cache.keys.blueprintByCategorySlug(slug)),
    ]);
  }
}
