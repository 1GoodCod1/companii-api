import { Injectable } from '@nestjs/common';
import { planHasFeature } from '../../../../common/constants/plan-entitlements.constants';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { CacheService } from '../../../shared/cache/cache.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { FsmContextService } from '../../context/fsm-context.service';

@Injectable()
export class CompanyServicesService {
  private readonly serviceInclude = {
    category: { select: { id: true, name: true, slug: true } },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly ctx: FsmContextService,
  ) {}

  list(user: JwtPayload) {
    this.ctx.assertNotTechnician(user);
    return this.prisma.companyService.findMany({
      where: { companyId: this.ctx.companyId(user) },
      include: this.serviceInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(
    user: JwtPayload,
    data: {
      name: string;
      defaultPrice: number;
      description?: string;
      categoryId?: string;
      durationMinutes?: number;
      isPublished?: boolean;
      materialsCost?: number;
      vatRate?: number;
      sortOrder?: number;
    },
  ) {
    this.ctx.assertNotTechnician(user);
    const companyId = this.ctx.companyId(user);
    const planCode = await this.companyPlanCode(companyId);
    const canEditInternal = planHasFeature(planCode, 'internalServices');
    const categoryId = await this.resolveCompanyCategoryId(companyId);

    const created = await this.prisma.companyService.create({
      data: {
        companyId,
        slug: this.buildServiceSlug(data.name),
        name: data.name.trim(),
        description: data.description?.trim() ?? '',
        categoryId,
        defaultPrice: data.defaultPrice,
        durationMinutes: data.durationMinutes,
        isPublished: Boolean(data.isPublished),
        sortOrder: data.sortOrder ?? 0,
        materialsCost: canEditInternal ? data.materialsCost : undefined,
        vatRate: canEditInternal ? data.vatRate : undefined,
      },
      include: this.serviceInclude,
    });
    await this.invalidateServiceCaches(companyId);
    return created;
  }

  async update(
    user: JwtPayload,
    id: string,
    data: {
      name?: string;
      defaultPrice?: number;
      description?: string;
      categoryId?: string | null;
      durationMinutes?: number | null;
      isPublished?: boolean;
      materialsCost?: number | null;
      vatRate?: number | null;
      sortOrder?: number;
    },
  ) {
    this.ctx.assertNotTechnician(user);
    const companyId = this.ctx.companyId(user);
    const existing = await this.prisma.companyService.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.SERVICE_NOT_FOUND);

    const planCode = await this.companyPlanCode(companyId);
    const canEditInternal = planHasFeature(planCode, 'internalServices');
    const categoryId = await this.resolveCompanyCategoryId(companyId);

    const updated = await this.prisma.companyService.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        defaultPrice: data.defaultPrice,
        description: data.description?.trim(),
        categoryId,
        durationMinutes: data.durationMinutes === null ? null : data.durationMinutes,
        isPublished: data.isPublished,
        sortOrder: data.sortOrder,
        ...(canEditInternal
          ? {
              materialsCost: data.materialsCost === null ? null : data.materialsCost,
              vatRate: data.vatRate === null ? null : data.vatRate,
            }
          : {}),
      },
      include: this.serviceInclude,
    });
    await this.invalidateServiceCaches(companyId);
    return updated;
  }

  async delete(user: JwtPayload, id: string) {
    this.ctx.assertNotTechnician(user);
    const companyId = this.ctx.companyId(user);
    const existing = await this.prisma.companyService.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.SERVICE_NOT_FOUND);
    await this.prisma.companyService.delete({ where: { id } });
    await this.invalidateServiceCaches(companyId);
    return { success: true };
  }

  private async companyPlanCode(companyId: string) {
    const sub = await this.prisma.companySubscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
    return sub?.plan.code ?? 'FREE';
  }

  private async resolveCompanyCategoryId(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { categoryId: true },
    });
    return company?.categoryId ?? null;
  }

  private buildServiceSlug(name: string): string {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'serviciu';
    return `${base}-${Date.now()}`;
  }

  private async invalidateServiceCaches(companyId: string) {
    const company = await this.prisma.runOutsideRlsContext(() =>
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { slug: true },
      }),
    );
    await this.cache.invalidatePublicServices(company?.slug);
    if (company?.slug) {
      await this.cache.invalidatePublicCompanies(company.slug);
    }
  }
}
