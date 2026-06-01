import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus, QuoteStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { findPortalCustomerForUser } from '../../../common/utils/portal-customer.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EmailService } from '../../email/email.service';
import { appendClientFeedback } from '../../estimates/utils/client-feedback.util';

const TERMINAL_PORTAL_ESTIMATE_STATUSES: ReadonlySet<EstimateProjectStatus> = new Set([
  EstimateProjectStatus.ACCEPTED,
  EstimateProjectStatus.CANCELLED,
  EstimateProjectStatus.IN_EXECUTION,
  EstimateProjectStatus.DONE,
]);

@Injectable()
export class RequestEstimateChangesUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async execute(user: JwtPayload, projectId: string, comment: string) {
    const trimmed = comment?.trim();
    if (!trimmed) {
      throw AppErrors.badRequest('Comentariul este obligatoriu');
    }
    if (trimmed.length > 2000) {
      throw AppErrors.badRequest('Comentariul depășește 2000 de caractere');
    }

    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    return this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{ status: EstimateProjectStatus; clientFeedback: any; number: string; title: string }>>`
        SELECT status, client_feedback as "clientFeedback", number, title FROM estimate_projects
        WHERE id = ${projectId} AND customer_id = ${customer.id} FOR UPDATE
      `;
      const project = lockedProjects[0];
      if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

      if (TERMINAL_PORTAL_ESTIMATE_STATUSES.has(project.status)) {
        throw AppErrors.badRequest(AppErrorMessages.STATUS_LOCKED);
      }
      if (project.status !== EstimateProjectStatus.SENT) {
        throw AppErrors.badRequest('Smeta nu este trimisă spre revizuire');
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

      const updated = await tx.estimateProject.update({
        where: { id: projectId },
        data: {
          status: EstimateProjectStatus.CALCULATED,
          clientFeedback: appendClientFeedback(project.clientFeedback, {
            kind: 'REQUEST_CHANGES',
            comment: trimmed,
          }),
        },
      });
      if (fullProject.quoteId) {
        await tx.quote.update({
          where: { id: fullProject.quoteId },
          data: { status: QuoteStatus.DRAFT },
        });
      }

      const notifyEmail = fullProject.company.contactEmail ?? fullProject.company.owner.email;
      if (notifyEmail) {
        void this.email.sendEstimateFeedbackEmail({
          to: notifyEmail,
          estimateNumber: fullProject.number,
          title: fullProject.title,
          clientName: fullProject.customer.fullName,
          comment: trimmed,
        });
      }

      return updated;
    });
  }
}
