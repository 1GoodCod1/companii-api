import { Injectable } from '@nestjs/common';
import {
  EstimateProjectStatus,
  NotificationCategory,
  NotificationType,
  QuoteStatus,
} from '@prisma/client';
import { AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from '../../services/projects/estimate-project-access.service';
import { EmailService } from '../../../email/email.service';
import { NotificationsSenderService } from '../../../notifications/services/notifications-sender.service';
import { AuditService } from '../../../audit/audit.service';
import { AuditAction } from '../../../audit/audit-action.enum';
import { AuditEntityType } from '../../../audit/audit-entity-type.enum';
import { projectInclude } from '../../estimate.constants';

@Injectable()
export class SendEstimateToClientUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsSenderService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async execute(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);
    if (
      project.status !== EstimateProjectStatus.CALCULATED &&
      project.status !== EstimateProjectStatus.APPROVED &&
      project.status !== EstimateProjectStatus.SENT
    ) {
      throw AppErrors.badRequest('Calculați calculul de preț înainte de trimitere.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.estimateProject.update({
        where: { id },
        data: { status: EstimateProjectStatus.SENT },
        include: projectInclude,
      });
      if (project.quoteId) {
        await tx.quote.update({
          where: { id: project.quoteId },
          data: { status: QuoteStatus.SENT },
        });
      }
      return next;
    });

    await this.audit.log({
      userId: user.sub,
      action: AuditAction.ESTIMATE_SENT,
      entityType: AuditEntityType.EstimateProject,
      entityId: id,
      newData: {
        number: updated.number,
        title: updated.title,
        grandTotal: Number(updated.grandTotal),
      },
    });

    const frontendUrl = this.config.get<string>('frontendUrl') || 'http://localhost:5174';
    const portalUrl = `${frontendUrl}/portal/smete`;

    const company = await this.prisma.runOutsideRlsContext(() =>
      this.prisma.company.findUnique({
        where: { id: this.ctx.companyId(user) },
        select: { name: true },
      }),
    );
    const companyName = company?.name ?? 'Companie';

    if (project.customer.email) {
      void this.email.sendEstimateEmail({
        to: project.customer.email,
        companyName,
        estimateNumber: project.number,
        title: project.title,
        total: Number(project.grandTotal),
        portalUrl,
      });
    }

    // In-app notification for the linked portal client (if the customer has one).
    if (updated.customer.portalUserId) {
      void this.notifications
        .send({
          userId: updated.customer.portalUserId,
          title: 'Deviz nou',
          message: `${companyName} v-a trimis devizul #${updated.number} - ${updated.title} spre examinare.`,
          type: NotificationType.IN_APP,
          category: NotificationCategory.QUOTE_SENT,
          metadata: {
            link: '/portal/smete',
            i18nKey: 'estimateSent',
            params: { companyName, number: updated.number, title: updated.title },
            projectId: updated.id,
            number: updated.number,
          },
        })
        .catch(() => undefined);
    }

    return { project: updated, emailSent: !!project.customer.email };
  }
}