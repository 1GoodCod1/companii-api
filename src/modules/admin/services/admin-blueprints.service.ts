import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { CacheService } from '../../shared/cache/cache.service';
import type { CreateAdminBlueprintDto, UpdateAdminBlueprintDto } from '../dto/admin-blueprint.dto';

@Injectable()
export class AdminBlueprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list() {
    return this.prisma.estimateBlueprint.findMany({
      include: {
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { projects: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateAdminBlueprintDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }

    const existing = await this.prisma.estimateBlueprint.findUnique({
      where: { categoryId: dto.categoryId },
    });
    if (existing) {
      throw AppErrors.conflict('This category already has an estimate blueprint');
    }

    const blueprint = await this.prisma.estimateBlueprint.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        version: dto.version ?? 1,
        config: dto.config as any,
        isActive: dto.isActive !== false,
      },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    await this.invalidateCache(category.slug);
    return blueprint;
  }

  async update(id: string, dto: UpdateAdminBlueprintDto) {
    const existing = await this.prisma.estimateBlueprint.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!existing) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.version !== undefined) data.version = dto.version;
    if (dto.config !== undefined) data.config = dto.config;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const blueprint = await this.prisma.estimateBlueprint.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });

    await this.invalidateCache(existing.category.slug);
    if (existing.category.slug !== blueprint.category.slug) {
      await this.invalidateCache(blueprint.category.slug);
    }
    return blueprint;
  }

  async delete(id: string) {
    const blueprint = await this.prisma.estimateBlueprint.findUnique({
      where: { id },
      include: {
        category: true,
        _count: { select: { projects: true } },
      },
    });
    if (!blueprint) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }

    if (blueprint._count.projects > 0) {
      throw AppErrors.conflict('Cannot delete a blueprint that is in use by estimate projects');
    }

    await this.prisma.estimateBlueprint.delete({ where: { id } });
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
