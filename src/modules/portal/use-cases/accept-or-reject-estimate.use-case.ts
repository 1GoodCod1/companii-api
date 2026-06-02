import { Inject, Injectable } from '@nestjs/common';
import { EstimateProjectStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PORTAL_REPOSITORY } from '../domain/ports/portal.repository.port';
import type { PrismaPortalRepository } from '../infrastructure/persistence/prisma-portal.repository';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { EmailService } from '../../email/email.service';
import {
  appendClientFeedback,
  type EstimateClientFeedbackKind,
} from '../../estimates/utils/client-feedback.util';

@Injectable()
export class AcceptOrRejectEstimateUseCase {
  constructor(
    @Inject(PORTAL_REPOSITORY)
    private readonly portalRepo: PrismaPortalRepository,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async execute(user: JwtPayload, projectId: string, status: 'ACCEPTED' | 'REJECTED') {
    const customer = await this.portalRepo.findCustomerByUserId(user.sub);
    const kind: EstimateClientFeedbackKind = status === 'ACCEPTED' ? 'ACCEPT' : 'REJECT';

    const { updatedProject, fullProject } = await this.portalRepo.acceptOrRejectEstimate(
      customer.id,
      projectId,
      status,
      (currentFeedback) => appendClientFeedback(currentFeedback, { kind }),
    );

    await this.audit.log({
      userId: user.sub,
      action:
        status === 'ACCEPTED'
          ? AuditAction.ESTIMATE_ACCEPTED
          : AuditAction.ESTIMATE_REJECTED,
      entityType: AuditEntityType.EstimateProject,
      entityId: projectId,
      newData: {
        number: fullProject.number,
        title: fullProject.title,
        grandTotal: Number(fullProject.grandTotal),
      },
    });

    const notifyEmail = fullProject.company.contactEmail ?? fullProject.company.owner.email;
    if (notifyEmail) {
      void this.email.sendEstimateStatusEmail({
        to: notifyEmail,
        companyName: fullProject.company.name,
        estimateNumber: fullProject.number,
        title: fullProject.title,
        clientName: fullProject.customer.fullName,
        status,
        total: Number(fullProject.grandTotal),
      });
    }

    return updatedProject;
  }
}
