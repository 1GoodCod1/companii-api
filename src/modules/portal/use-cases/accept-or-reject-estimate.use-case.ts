import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { findPortalCustomerForUser } from '../../../common/utils/portal-customer.util';
import { PrismaService } from '../../shared/database/prisma.service';
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
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async execute(user: JwtPayload, projectId: string, status: 'ACCEPTED' | 'REJECTED') {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    return this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{ status: EstimateProjectStatus; clientFeedback: any; number: string; title: string; grandTotal: any }>>`
        SELECT status, client_feedback as "clientFeedback", number, title, grand_total as "grandTotal"
        FROM estimate_projects 
        WHERE id = ${projectId} AND customer_id = ${customer.id} FOR UPDATE
      `;
      const project = lockedProjects[0];
      if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
      if (project.status !== EstimateProjectStatus.SENT) {
        throw AppErrors.conflict('Smeta a fost deja procesată.');
      }

      const fullProject = await tx.estimateProject.findUniqueOrThrow({
        where: { id: projectId },
        include: {
          customer: { select: { fullName: true } },
          company: {
            select: {
              name: true,
              contactEmail: true,
              owner: { select: { email: true } },
            },
          },
        },
      });

      const kind: EstimateClientFeedbackKind = status === 'ACCEPTED' ? 'ACCEPT' : 'REJECT';
      const updated = await tx.estimateProject.update({
        where: { id: projectId },
        data: {
          status:
            status === 'ACCEPTED'
              ? EstimateProjectStatus.ACCEPTED
              : EstimateProjectStatus.CANCELLED,
          clientFeedback: appendClientFeedback(project.clientFeedback, { kind }),
        },
      });

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

      return updated;
    });
  }
}
