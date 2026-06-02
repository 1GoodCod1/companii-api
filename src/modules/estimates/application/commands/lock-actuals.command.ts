import { Injectable } from '@nestjs/common';
import { AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from '../../services/projects/estimate-project-access.service';
import { EstimateProjectActualsService } from '../../services/projects/estimate-project-actuals.service';
import { EmailService } from '../../../email/email.service';
import { projectInclude, round2 } from '../../estimate.constants';
import { accumulateEstimateLineTotals } from '../../utils/calculation/estimate-line-recalculate.util';

@Injectable()
export class LockActualsCommandHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly actuals: EstimateProjectActualsService,
    private readonly email: EmailService,
  ) {}

  async execute(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);
    if (project.actualsLockedAt) throw AppErrors.badRequest('Smeta a fost deja blocată ("lock-actuals").');

    const enriched = this.actuals.computeProjectActualsAndVariance(project);
    const shouldAlert = enriched.materialVariancePct > 15;
    const actualVariance = enriched.materialVariance;
    const actualVariancePct = enriched.materialVariancePct;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM estimate_projects WHERE id = ${id} FOR UPDATE`;
      const stages = await tx.estimateStage.findMany({ where: { projectId: id }, include: { lines: true } });

      for (const stage of stages) {
        const linesToUpdate = stage.lines.filter((l) => l.actualLineTotal !== null);
        for (const line of linesToUpdate) {
          await tx.estimateLine.update({ where: { id: line.id }, data: { unitPrice: line.actualUnitPrice!, lineTotal: line.actualLineTotal!, source: 'actual' } });
        }
        const allStageLines = await tx.estimateLine.findMany({ where: { stageId: stage.id } });
        const { laborCost, materialCost } = accumulateEstimateLineTotals(allStageLines.map((l) => ({ unit: l.unit, description: l.description, lineTotal: l.lineTotal })));
        await tx.estimateStage.update({ where: { id: stage.id }, data: { laborCost, materialCost, stageTotal: round2(laborCost + materialCost) } });
      }

      const updatedStages = await tx.estimateStage.findMany({ where: { projectId: id } });
      const laborTotal = round2(updatedStages.reduce((acc, s) => acc + Number(s.laborCost), 0));
      const materialTotal = round2(updatedStages.reduce((acc, s) => acc + Number(s.materialCost), 0));
      const subtotal = laborTotal + materialTotal;
      const marginPct = Number(project.marginPct);
      const grandTotal = round2(subtotal * (1 + marginPct / 100));

      const allProjectLines = await tx.estimateLine.findMany({ where: { stage: { projectId: id } } });
      const priceFactor = 1 + marginPct / 100;
      let tvaAmount = 0;
      for (const line of allProjectLines) {
        const rate = line.vatRate !== null && line.vatRate !== undefined ? Number(line.vatRate) : Number(project.tvaRate ?? 0);
        tvaAmount += Number(line.lineTotal) * priceFactor * (rate / 100);
      }
      tvaAmount = round2(tvaAmount);

      await tx.estimateProject.update({ where: { id }, data: { laborTotal, materialTotal, grandTotal, tvaAmount, grandTotalWithVat: round2(grandTotal + tvaAmount), actualsLockedAt: new Date(), version: { increment: 1 } } });
      const updatedProject = await tx.estimateProject.findUniqueOrThrow({ where: { id }, include: projectInclude });
      return this.actuals.computeProjectActualsAndVariance(updatedProject);
    });

    if (shouldAlert) {
      const companyId = this.ctx.companyId(user);
      const company = await this.prisma.runOutsideRlsContext(() =>
        this.prisma.company.findUnique({
          where: { id: companyId },
          select: {
            name: true,
            contactEmail: true,
            owner: { select: { email: true } },
            members: {
              where: { status: 'ACTIVE', role: { in: ['OWNER', 'MANAGER'] } },
              select: { user: { select: { email: true } } },
            },
          },
        }),
      );

      if (company) {
        const recipients = [
          company.owner.email,
          company.contactEmail,
          ...company.members.map((m) => m.user.email),
        ].filter((email): email is string => Boolean(email));

        const uniqueRecipients = [...new Set(recipients)];
        for (const to of uniqueRecipients) {
          void this.email.sendEstimateVarianceAlertEmail({
            to,
            estimateNumber: project.number,
            projectName: project.title,
            variance: actualVariance,
            variancePct: actualVariancePct,
          });
        }
      }
    }

    return result;
  }
}
