import { Injectable } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class AdminModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
}
