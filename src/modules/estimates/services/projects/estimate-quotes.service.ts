import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EstimateProjectStatus, QuoteStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EmailService } from '../../../email/email.service';
import { EstimatePdfService } from '../../../fsm/pdf/estimate-pdf.service';
import { projectInclude } from '../../estimate.constants';
import { isEstimateRecalculable } from '../../utils/project/estimate-status-transitions.util';
import { nextCompanyNumber } from '../../../../common/utils/sequence-number.util';
import { RLS_SYSTEM_CONTEXT } from '../../../../common/rls/rls-system.util';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import { EstimateStagesService } from './estimate-stages.service';
import { AuditService } from '../../../audit/audit.service';
import { AuditAction } from '../../../audit/audit-action.enum';
import { AuditEntityType } from '../../../audit/audit-entity-type.enum';

@Injectable()
export class EstimateQuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly stages: EstimateStagesService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly estimatePdf: EstimatePdfService,
    private readonly audit: AuditService,
  ) {}

  async generateQuote(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    let project = await this.access.findProjectOrThrow(user, id);
    if (project.quoteId) {
      throw AppErrors.conflict('Quote already generated for this estimate');
    }
    if (
      project.status !== EstimateProjectStatus.CALCULATED &&
      project.status !== EstimateProjectStatus.APPROVED
    ) {
      if (!isEstimateRecalculable(project.status)) {
        throw AppErrors.badRequest('Calculați calculul de preț înainte de a genera oferta.');
      }
      project = await this.stages.calculate(user, id);
    }

    const cid = this.ctx.companyId(user);

    return this.prisma.$transaction(async (tx) => {
      const number = await nextCompanyNumber(tx, {
        companyId: cid,
        namespace: 'quote-number',
        prefix: 'QTE',
        count: () => tx.quote.count({ where: { companyId: cid } }),
        exists: async (n) =>
          this.prisma.runOutsideRlsContext(() =>
            this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) => {
              const q = await db.quote.findUnique({
                where: { number: n },
                select: { id: true },
              });
              return q !== null;
            }),
          ),
      });

      const lines = project.stages.flatMap((stage) =>
        stage.lines.map((line) => ({
          description: `[${stage.name}] ${line.description}`,
          qty: Number(line.qty),
          unitPrice: Number(line.unitPrice),
        })),
      );

      const total = lines.reduce((acc, line) => acc + line.qty * line.unitPrice, 0);
      const quote = await tx.quote.create({
        data: {
          companyId: cid,
          customerId: project.customerId,
          number,
          total,
          validUntil: project.validUntil ?? undefined,
          status: QuoteStatus.DRAFT,
          lines: { create: lines },
        },
      });

      return tx.estimateProject.update({
        where: { id },
        data: {
          quoteId: quote.id,
          status: EstimateProjectStatus.APPROVED,
        },
        include: projectInclude,
      });
    });
  }

  async sendToClient(user: JwtPayload, id: string) {
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
      // Keep the linked Quote (oferta) status in lock-step with the estimate.
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

    if (project.customer.email) {
      const company = await this.prisma.runOutsideRlsContext(() =>
        this.prisma.company.findUnique({
          where: { id: this.ctx.companyId(user) },
          select: { name: true },
        }),
      );
      void this.email.sendEstimateEmail({
        to: project.customer.email,
        companyName: company?.name ?? 'Companie',
        estimateNumber: project.number,
        title: project.title,
        total: Number(project.grandTotal),
        portalUrl,
      });
    }

    return { project: updated, emailSent: !!project.customer.email };
  }

  async getProjectPdf(user: JwtPayload, id: string, lang?: 'ro' | 'ru') {
    this.ctx.assertManagement(user);
    const project = await this.access.loadProjectForPdf(this.ctx.companyId(user), id);
    const buffer = await this.estimatePdf.build(project, { locale: lang });
    return { buffer, filename: `${project.number}.pdf` };
  }

  async getProjectPdfStream(user: JwtPayload, id: string, lang?: 'ro' | 'ru') {
    this.ctx.assertManagement(user);
    const project = await this.access.loadProjectForPdf(this.ctx.companyId(user), id);
    const readable = await this.estimatePdf.buildStream(project, { locale: lang });
    return { readable, filename: `${project.number}.pdf` };
  }
}
