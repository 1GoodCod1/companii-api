import { Inject, Injectable } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService } from '../../audit/audit.service';
import { ADMIN_REPOSITORY } from '../domain/ports/admin.repository.port';
import type { PrismaAdminRepository } from '../infrastructure/persistence/prisma-admin.repository';

@Injectable()
export class AdminModerationService {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: PrismaAdminRepository,
    private readonly audit: AuditService,
  ) {}

  listReviews() {
    return this.adminRepo.listReviews();
  }

  async moderateReview(id: string, status: ReviewStatus, adminUserId: string) {
    const existing = await this.adminRepo.findReviewById(id);
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const updated = await this.adminRepo.updateReviewStatus(id, status);

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
}
