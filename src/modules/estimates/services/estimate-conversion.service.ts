import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { CompanyAuthorizationService } from '../../companies/authorization/company-authorization.service';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesContextService } from '../context/estimates-context.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';

@Injectable()
export class EstimateConversionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async convertToInterventions(
    user: JwtPayload,
    id: string,
    mode: 'single' | 'by-stage' = 'single',
  ) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);
    const cid = this.ctx.companyId(user);

    if (project.status !== EstimateProjectStatus.ACCEPTED) {
      throw AppErrors.badRequest('Smeta trebuie acceptată de client înainte de convertire.');
    }

    const additional = mode === 'by-stage' ? project.stages.length : 1;
    await this.companyAuth.assertInterventionMonthlyLimit(cid, additional);

    if (mode === 'by-stage') {
      return this.prisma.$transaction(async (tx) => {
        const interventions: Awaited<ReturnType<typeof tx.intervention.create>>[] = [];
        for (const stage of project.stages) {
          const intNumber = await this.access.nextInterventionNumber(tx, cid);
          const intervention = await tx.intervention.create({
            data: {
              companyId: cid,
              customerId: project.customerId,
              number: intNumber,
              type: project.category.name,
              description: `${stage.name}\n${stage.description ?? ''}`.trim(),
              address: project.address ?? project.customer.address,
              estimatedPrice: stage.stageTotal,
              estimateProjectId: project.id,
              estimateStageId: stage.id,
              status: 'NEW',
            },
          });
          interventions.push(intervention);
        }

        await tx.estimateProject.update({
          where: { id },
          data: { status: EstimateProjectStatus.IN_EXECUTION },
        });

        return { interventions };
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const intNumber = await this.access.nextInterventionNumber(tx, cid);
      const description = project.stages
        .map((s) => `• ${s.name} (${Number(s.stageTotal)} MDL)`)
        .join('\n');

      const intervention = await tx.intervention.create({
        data: {
          companyId: cid,
          customerId: project.customerId,
          number: intNumber,
          type: project.category.name,
          description: `Din smetă ${project.number}:\n${description}`,
          address: project.address ?? project.customer.address,
          estimatedPrice: project.grandTotal,
          estimateProjectId: project.id,
          status: 'NEW',
        },
      });

      await tx.estimateProject.update({
        where: { id },
        data: { status: EstimateProjectStatus.IN_EXECUTION },
      });

      return { intervention };
    });
  }
}
