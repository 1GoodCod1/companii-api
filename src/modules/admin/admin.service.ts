import { Injectable } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { AppErrors, AppErrorMessages } from '../../common/errors';
import { AuditAction } from '../audit/audit-action.enum';
import { AuditEntityType } from '../audit/audit-entity-type.enum';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../shared/database/prisma.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import type { CreateAdminCategoryDto, UpdateAdminCategoryDto } from './dto/admin-category.dto';
import type { CreateAdminCityDto, UpdateAdminCityDto } from './dto/admin-city.dto';
import type { UpdateAdminClientDto } from './dto/admin-client.dto';
import type { AdminAuditQueryDto } from './dto/admin-audit-query.dto';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function uniqueSlug(
  prisma: PrismaService,
  table: 'city' | 'category',
  base: string,
  excludeId?: string,
): Promise<string> {
  let slug = base;
  let n = 0;
  while (true) {
    const existing =
      table === 'city'
        ? await prisma.city.findFirst({ where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) } })
        : await prisma.category.findFirst({
            where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
          });
    if (!existing) return slug;
    slug = `${base}-${++n}`;
  }
}

const companyListInclude = {
  city: true,
  category: true,
  owner: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } },
  subscription: { include: { plan: true } },
} as const;

const companyDetailInclude = {
  city: true,
  category: true,
  owner: {
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      isActive: true,
      createdAt: true,
    },
  },
  subscription: { include: { plan: true } },
  galleryImages: { orderBy: { sortOrder: 'asc' as const } },
  documents: { orderBy: { createdAt: 'desc' as const } },
  _count: {
    select: {
      members: true,
      customers: true,
      interventions: true,
      reviews: true,
      packages: true,
    },
  },
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  assertAdmin(user: JwtPayload): void {
    if (user.accountKind !== 'PLATFORM_ADMIN') {
      throw AppErrors.forbidden(AppErrorMessages.GUARD_ACCESS_DENIED);
    }
  }

  pendingCompanies() {
    return this.prisma.company.findMany({
      where: { isVerified: false },
      include: companyListInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCompany(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: companyDetailInclude,
    });
    if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);
    return company;
  }

  private async findCompanyOrThrow(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);
    return company;
  }

  async verifyCompany(id: string, adminUserId: string, note?: string) {
    const existing = await this.findCompanyOrThrow(id);
    const updated = await this.prisma.company.update({
      where: { id },
      data: { isVerified: true },
      include: companyDetailInclude,
    });

    void this.audit.log({
      userId: adminUserId,
      action: AuditAction.COMPANY_VERIFIED,
      entityType: AuditEntityType.Company,
      entityId: id,
      oldData: { isVerified: existing.isVerified, isPublished: existing.isPublished },
      newData: { isVerified: true, note: note ?? null },
    });

    return updated;
  }

  async rejectCompany(id: string, adminUserId: string, note?: string) {
    const existing = await this.findCompanyOrThrow(id);
    const updated = await this.prisma.company.update({
      where: { id },
      data: { isVerified: false, isPublished: false },
      include: companyDetailInclude,
    });

    void this.audit.log({
      userId: adminUserId,
      action: AuditAction.COMPANY_REJECTED,
      entityType: AuditEntityType.Company,
      entityId: id,
      oldData: { isVerified: existing.isVerified, isPublished: existing.isPublished },
      newData: { isVerified: false, isPublished: false, note: note ?? null },
    });

    return updated;
  }

  async unpublishCompany(id: string, adminUserId: string, note?: string) {
    const existing = await this.findCompanyOrThrow(id);
    const updated = await this.prisma.company.update({
      where: { id },
      data: { isPublished: false },
      include: companyDetailInclude,
    });

    void this.audit.log({
      userId: adminUserId,
      action: AuditAction.COMPANY_UNPUBLISHED,
      entityType: AuditEntityType.Company,
      entityId: id,
      oldData: { isPublished: existing.isPublished },
      newData: { isPublished: false, note: note ?? null },
    });

    return updated;
  }

  listAuditLogs(query: AdminAuditQueryDto) {
    const limit = query.limit ?? 50;
    return this.prisma.auditLog.findMany({
      where: {
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.action ? { action: query.action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  listWaitlist() {
    return this.prisma.companyWaitlist.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  listReviews() {
    return this.prisma.companyReview.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        company: { select: { id: true, name: true, slug: true } },
        author: { select: { id: true, email: true, firstName: true, lastName: true } },
        intervention: { select: { id: true, number: true } },
      },
    });
  }

  async moderateReview(id: string, status: ReviewStatus, adminUserId: string) {
    const existing = await this.prisma.companyReview.findUnique({ where: { id } });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const updated = await this.prisma.companyReview.update({
      where: { id },
      data: { status },
      include: {
        company: { select: { id: true, name: true, slug: true } },
        author: { select: { id: true, email: true, firstName: true, lastName: true } },
        intervention: { select: { id: true, number: true } },
      },
    });

    void this.audit.log({
      userId: adminUserId,
      action: AuditAction.REVIEW_MODERATED,
      entityType: AuditEntityType.Company,
      entityId: existing.companyId,
      oldData: { reviewId: id, status: existing.status },
      newData: { reviewId: id, status },
    });

    return updated;
  }

  stats() {
    return this.prisma
      .$transaction([
        this.prisma.company.count(),
        this.prisma.user.count(),
        this.prisma.intervention.count(),
        this.prisma.companyWaitlist.count(),
      ])
      .then(([companies, users, interventions, waitlist]) => ({
        companies,
        users,
        interventions,
        waitlist,
      }));
  }

  listCompanies() {
    return this.prisma.company.findMany({
      include: companyListInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  listCities() {
    return this.prisma.city.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { companies: true } } },
    });
  }

  async createCity(dto: CreateAdminCityDto) {
    const baseSlug = dto.slug?.trim() || slugify(dto.name);
    const slug = await uniqueSlug(this.prisma, 'city', baseSlug);
    return this.prisma.city.create({
      data: { name: dto.name.trim(), slug },
      include: { _count: { select: { companies: true } } },
    });
  }

  async updateCity(id: string, dto: UpdateAdminCityDto) {
    const existing = await this.prisma.city.findUnique({ where: { id } });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const data: { name?: string; slug?: string } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    if (dto.slug?.trim()) {
      data.slug = await uniqueSlug(this.prisma, 'city', dto.slug.trim(), id);
    } else if (dto.name?.trim()) {
      data.slug = await uniqueSlug(this.prisma, 'city', slugify(dto.name.trim()), id);
    }

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
      include: { _count: { select: { companies: true, packages: true } } },
    });
  }

  async createCategory(dto: CreateAdminCategoryDto) {
    const baseSlug = dto.slug?.trim() || slugify(dto.name);
    const slug = await uniqueSlug(this.prisma, 'category', baseSlug);
    return this.prisma.category.create({
      data: { name: dto.name.trim(), slug },
      include: { _count: { select: { companies: true, packages: true } } },
    });
  }

  async updateCategory(id: string, dto: UpdateAdminCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const data: { name?: string; slug?: string } = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    if (dto.slug?.trim()) {
      data.slug = await uniqueSlug(this.prisma, 'category', dto.slug.trim(), id);
    } else if (dto.name?.trim()) {
      data.slug = await uniqueSlug(this.prisma, 'category', slugify(dto.name.trim()), id);
    }

    return this.prisma.category.update({
      where: { id },
      data,
      include: { _count: { select: { companies: true, packages: true } } },
    });
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { companies: true, packages: true } } },
    });
    if (!category) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (category._count.companies > 0 || category._count.packages > 0) {
      throw AppErrors.conflict(AppErrorMessages.CATALOG_IN_USE);
    }
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category deleted' };
  }

  listClients() {
    return this.prisma.user.findMany({
      where: { accountKind: 'END_CLIENT' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        portalCustomer: {
          select: {
            id: true,
            fullName: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async updateClient(id: string, dto: UpdateAdminClientDto) {
    const existing = await this.prisma.user.findFirst({
      where: { id, accountKind: 'END_CLIENT' },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        portalCustomer: {
          select: {
            id: true,
            fullName: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
}
