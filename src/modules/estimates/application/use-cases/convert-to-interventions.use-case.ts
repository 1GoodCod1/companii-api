import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus, QuoteStatus } from '@prisma/client';
import { AppErrors, AppErrorMessages } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from '../../services/projects/estimate-project-access.service';
import { CompanyAuthorizationService } from '../../../companies/authorization/company-authorization.service';
import { AuditService } from '../../../audit/audit.service';
import { AuditAction } from '../../../audit/audit-action.enum';
import { AuditEntityType } from '../../../audit/audit-entity-type.enum';
import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprint-config.types';
import { buildSingleInterventionDescription } from '../../utils/worksheet/intervention-description.util';
import { filterWorksheetStages } from '../../utils/worksheet/worksheet-stage-filter.util';
import {
  estimateClientPriceFactor,
  toClientPrice,
} from '../../utils/calculation/client-price.util';

@Injectable()
export class ConvertToInterventionsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly companyAuth: CompanyAuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async execute(user: JwtPayload, id: string, mode: 'single' | 'by-stage' = 'single') {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);
    const cid = this.ctx.companyId(user);

    if (project.status !== EstimateProjectStatus.ACCEPTED) {
      throw AppErrors.badRequest('Calculul de preț trebuie acceptat de client înainte de convertire.');
    }

    const additional = mode === 'by-stage' ? project.stages.length : 1;
    await this.companyAuth.assertInterventionMonthlyLimit(cid, additional);

    const blueprintConfig = project.blueprint?.config
      ? (project.blueprint.config as EstimateBlueprintConfig)
      : null;
    const diagnostic =
      project.diagnosticAnswers && typeof project.diagnosticAnswers === 'object'
        ? (project.diagnosticAnswers as Record<string, unknown>)
        : null;
    const activeStages = filterWorksheetStages(project.stages, blueprintConfig, diagnostic);

    if (mode === 'by-stage') {
      const result = await this.prisma.$transaction(async (tx) => {
        const lockedProjects = await tx.$queryRaw<Array<{ status: EstimateProjectStatus }>>`
          SELECT status FROM estimate_projects WHERE id = ${id} FOR UPDATE
        `;
        const currentStatus = lockedProjects[0]?.status;
        if (!currentStatus) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
        if (currentStatus !== EstimateProjectStatus.ACCEPTED) {
          throw AppErrors.conflict('Calculul de preț a fost deja convertit sau are alt status.');
        }

        const sourceLead = await tx.companyLead.findFirst({
          where: { estimateProjectId: id },
        });
        const priceFactor = estimateClientPriceFactor(project);
        const interventions: Awaited<ReturnType<typeof tx.intervention.create>>[] = [];
        for (const stage of activeStages) {
          const intNumber = await this.access.nextInterventionNumber(tx, cid);
          const intervention = await tx.intervention.create({
            data: {
              companyId: cid,
              customerId: project.customerId,
              number: intNumber,
              type: project.category.name,
              description: `${stage.name}\n${stage.description ?? ''}`.trim(),
              address: project.address ?? project.customer.address,
              estimatedPrice: toClientPrice(stage.stageTotal ?? 0, priceFactor),
              estimateProjectId: project.id,
              estimateStageId: stage.id,
              sourceLeadId: sourceLead?.id ?? undefined,
              status: 'NEW',
            },
          });
          interventions.push(intervention);
        }

        await tx.estimateProject.update({
          where: { id },
          data: { status: EstimateProjectStatus.IN_EXECUTION },
        });
        if (project.quoteId) {
          await tx.quote.update({
            where: { id: project.quoteId },
            data: { status: QuoteStatus.CONVERTED },
          });
        }

        if (sourceLead) {
          await tx.companyLead.update({
            where: { id: sourceLead.id },
            data: {
              status: 'CONVERTED',
              convertedAt: new Date(),
            },
          });
        }

        return { interventions };
      });

      await this.audit.log({
        userId: user.sub,
        action: AuditAction.ESTIMATE_CONVERTED,
        entityType: AuditEntityType.EstimateProject,
        entityId: id,
        newData: {
          mode,
          number: project.number,
          title: project.title,
          grandTotal: Number(project.grandTotal),
        },
      });

      return result;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{ status: EstimateProjectStatus }>>`
        SELECT status FROM estimate_projects WHERE id = ${id} FOR UPDATE
      `;
      const currentStatus = lockedProjects[0]?.status;
      if (!currentStatus) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
      if (currentStatus !== EstimateProjectStatus.ACCEPTED) {
        throw AppErrors.conflict('Calculul de preț a fost deja convertit sau are alt status.');
      }

      const sourceLead = await tx.companyLead.findFirst({
        where: { estimateProjectId: id },
      });

      const intNumber = await this.access.nextInterventionNumber(tx, cid);
      const description = buildSingleInterventionDescription(project.number, project);

      const intervention = await tx.intervention.create({
        data: {
          companyId: cid,
          customerId: project.customerId,
          number: intNumber,
          type: project.category.name,
          description,
          address: project.address ?? project.customer.address,
          estimatedPrice: project.grandTotal,
          estimateProjectId: project.id,
          sourceLeadId: sourceLead?.id ?? undefined,
          status: 'NEW',
        },
      });

      await tx.estimateProject.update({
        where: { id },
        data: { status: EstimateProjectStatus.IN_EXECUTION },
      });
      if (project.quoteId) {
        await tx.quote.update({
          where: { id: project.quoteId },
          data: { status: QuoteStatus.CONVERTED },
        });
      }

      if (sourceLead) {
        await tx.companyLead.update({
          where: { id: sourceLead.id },
          data: {
            status: 'CONVERTED',
            convertedAt: new Date(),
          },
        });
      }

      return { intervention };
    });

    await this.audit.log({
      userId: user.sub,
      action: AuditAction.ESTIMATE_CONVERTED,
      entityType: AuditEntityType.EstimateProject,
      entityId: id,
      newData: {
        mode,
        number: project.number,
        title: project.title,
        grandTotal: Number(project.grandTotal),
      },
    });

    return result;
  }
}