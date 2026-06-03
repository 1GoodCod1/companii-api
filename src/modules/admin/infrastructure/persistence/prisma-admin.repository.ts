import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { Prisma, ReviewStatus } from '@prisma/client';
import type { AdminAuditQueryDto } from '@/modules/admin/dto/admin-audit-query.dto';
import type { AdminRepository } from '../../domain/ports/admin.repository.port';
import { companyDetailInclude, companyListInclude } from '../../admin.constants';

@Injectable()
export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  getStats() {
    return this.prisma.inSerial([
      () => this.prisma.company.count(),
      () => this.prisma.user.count(),
      () => this.prisma.intervention.count(),
      () => this.prisma.companyWaitlist.count(),
    ]).then(([companies, users, interventions, waitlist]) => ({
      companies,
      users,
      interventions,
      waitlist,
    }));
  }

  listWaitlist() {
    return this.prisma.companyWaitlist.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
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

  async listClients() {
    const rows = await this.prisma.user.findMany({
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
        portalCustomers: {
          select: {
            id: true,
            fullName: true,
            company: { select: { id: true, name: true } },
          },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    // Backward-compatible shape: surface a single representative portalCustomer.
    return rows.map(({ portalCustomers, ...rest }) => ({
      ...rest,
      portalCustomer: portalCustomers[0] ?? null,
    }));
  }

  findClientById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, accountKind: 'END_CLIENT' },
    });
  }

  async updateClient(id: string, data: Prisma.UserUncheckedUpdateInput) {
    const { portalCustomers, ...rest } = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        portalCustomers: {
          select: {
            id: true,
            fullName: true,
            company: { select: { id: true, name: true } },
          },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return { ...rest, portalCustomer: portalCustomers[0] ?? null };
  }

  pendingCompanies() {
    return this.prisma.company.findMany({
      where: { isVerified: false },
      include: companyListInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  findCompanyById(id: string, includeDetails?: boolean) {
    return this.prisma.company.findUnique({
      where: { id },
      ...(includeDetails ? { include: companyDetailInclude } : {}),
    });
  }

  listCompanies() {
    return this.prisma.company.findMany({
      include: companyListInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  updateCompany(id: string, data: Prisma.CompanyUncheckedUpdateInput, includeDetails?: boolean) {
    return this.prisma.company.update({
      where: { id },
      data,
      ...(includeDetails ? { include: companyDetailInclude } : {}),
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

  findReviewById(id: string) {
    return this.prisma.companyReview.findUnique({ where: { id } });
  }

  updateReviewStatus(id: string, status: ReviewStatus) {
    return this.prisma.companyReview.update({
      where: { id },
      data: { status },
      include: {
        company: { select: { id: true, name: true, slug: true } },
        author: { select: { id: true, email: true, firstName: true, lastName: true } },
        intervention: { select: { id: true, number: true } },
      },
    });
  }

  listCities() {
    return this.prisma.city.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { companies: true } } },
    });
  }

  findCityById(id: string) {
    return this.prisma.city.findUnique({
      where: { id },
      include: { _count: { select: { companies: true } } },
    });
  }

  createCity(data: Prisma.CityCreateInput) {
    return this.prisma.city.create({
      data,
      include: { _count: { select: { companies: true } } },
    });
  }

  updateCity(id: string, data: Prisma.CityUpdateInput) {
    return this.prisma.city.update({
      where: { id },
      data,
      include: { _count: { select: { companies: true } } },
    });
  }

  async deleteCity(id: string) {
    await this.prisma.city.delete({ where: { id } });
  }

  listCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { companies: true, companyServices: true } } },
    });
  }

  findCategoryById(id: string) {
    return this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { companies: true, companyServices: true } } },
    });
  }

  createCategory(data: Prisma.CategoryCreateInput) {
    return this.prisma.category.create({
      data,
      include: { _count: { select: { companies: true, companyServices: true } } },
    });
  }

  updateCategory(id: string, data: Prisma.CategoryUpdateInput) {
    return this.prisma.category.update({
      where: { id },
      data,
      include: { _count: { select: { companies: true, companyServices: true } } },
    });
  }

  async deleteCategory(id: string) {
    await this.prisma.category.delete({ where: { id } });
  }

  async uniqueCitySlug(base: string, excludeId?: string): Promise<string> {
    let slug = base;
    let n = 0;
    while (true) {
      const existing = await this.prisma.city.findFirst({
        where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      });
      if (!existing) return slug;
      slug = `${base}-${++n}`;
    }
  }

  async uniqueCategorySlug(base: string, excludeId?: string): Promise<string> {
    let slug = base;
    let n = 0;
    while (true) {
      const existing = await this.prisma.category.findFirst({
        where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      });
      if (!existing) return slug;
      slug = `${base}-${++n}`;
    }
  }

  listBlueprints() {
    return this.prisma.estimateBlueprint.findMany({
      include: {
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { projects: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  findBlueprintById(id: string) {
    return this.prisma.estimateBlueprint.findUnique({
      where: { id },
      include: {
        category: true,
        _count: { select: { projects: true } },
      },
    });
  }

  findBlueprintByCategoryId(categoryId: string) {
    return this.prisma.estimateBlueprint.findUnique({
      where: { categoryId },
    });
  }

  createBlueprint(data: Prisma.EstimateBlueprintUncheckedCreateInput) {
    return this.prisma.estimateBlueprint.create({
      data,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
  }

  updateBlueprint(id: string, data: Prisma.EstimateBlueprintUncheckedUpdateInput) {
    return this.prisma.estimateBlueprint.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
  }

  async deleteBlueprint(id: string) {
    await this.prisma.estimateBlueprint.delete({ where: { id } });
  }
}
