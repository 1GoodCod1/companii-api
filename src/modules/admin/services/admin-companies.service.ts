import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { companyDetailInclude, companyListInclude } from '../admin.constants';

@Injectable()
export class AdminCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

  listCompanies() {
    return this.prisma.company.findMany({
      include: companyListInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
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

  private async findCompanyOrThrow(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);
    return company;
  }
}
