import { Inject, Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService } from '../../audit/audit.service';
import { ADMIN_REPOSITORY } from '../domain/ports/admin.repository.port';
import type { PrismaAdminRepository } from '../infrastructure/persistence/prisma-admin.repository';

@Injectable()
export class AdminCompaniesService {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: PrismaAdminRepository,
    private readonly audit: AuditService,
  ) {}

  pendingCompanies() {
    return this.adminRepo.pendingCompanies();
  }

  async getCompany(id: string) {
    const company = await this.adminRepo.findCompanyById(id, /* includeDetails */ true);
    if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);
    return company;
  }

  listCompanies() {
    return this.adminRepo.listCompanies();
  }

  async verifyCompany(id: string, adminUserId: string, note?: string) {
    const existing = await this.findCompanyOrThrow(id);
    const updated = await this.adminRepo.updateCompany(id, { isVerified: true }, /* includeDetails */ true);

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
    const updated = await this.adminRepo.updateCompany(id, { isVerified: false, isPublished: false }, /* includeDetails */ true);

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
    const updated = await this.adminRepo.updateCompany(id, { isPublished: false }, /* includeDetails */ true);

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
    const company = await this.adminRepo.findCompanyById(id, /* includeDetails */ false);
    if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);
    return company;
  }
}
