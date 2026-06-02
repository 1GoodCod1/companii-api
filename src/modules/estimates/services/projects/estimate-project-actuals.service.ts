import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { projectInclude, type EstimateProjectDetail, round2 } from '../../estimate.constants';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import { isEstimateLaborLine, accumulateEstimateLineTotals } from '../../utils/calculation/estimate-line-recalculate.util';
import { EmailService } from '../../../email/email.service';

@Injectable()
export class EstimateProjectActualsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly email: EmailService,
  ) {}

  computeProjectActualsAndVariance(project: EstimateProjectDetail) {
    let materialBudget = 0;
    let materialActual = 0;
    let materialActualSpent = 0;

    let materialLinesTotal = 0;
    let materialLinesPurchased = 0;
    let materialLinesSkipped = 0;
    let materialLinesPending = 0;

    if (project.stages) {
      for (const stage of project.stages) {
        if (stage.lines) {
          for (const line of stage.lines) {
            const isLabor = isEstimateLaborLine({
              unit: line.unit,
              description: line.description,
            });

            if (!isLabor) {
              materialLinesTotal++;
              const lineTotal = Number(line.lineTotal);
              materialBudget += lineTotal;

              if (line.actualStatus === 'PURCHASED' || line.actualStatus === 'VERIFIED') {
                materialLinesPurchased++;
                const actualLineTotal = Number(line.actualLineTotal ?? 0);
                materialActual += actualLineTotal;
                materialActualSpent += actualLineTotal;
              } else if (line.actualStatus === 'NO_RECEIPT') {
                materialLinesPurchased++;
                const actualLineTotal = Number(line.actualLineTotal ?? 0);
                materialActual += actualLineTotal;
              } else if (line.actualStatus === 'SKIPPED') {
                materialLinesSkipped++;
              } else if (line.actualStatus === 'PENDING') {
                materialLinesPending++;
              }

              const lineWithVariance = line as typeof line & { variancePct?: number | null };
              if (line.actualLineTotal !== null && line.actualLineTotal !== undefined) {
                const variance = Number(line.actualLineTotal) - lineTotal;
                lineWithVariance.variancePct = lineTotal > 0 ? Math.round((variance / lineTotal) * 100 * 100) / 100 : 0;
              } else {
                lineWithVariance.variancePct = null;
              }
            } else {
              (line as typeof line & { variancePct?: number | null }).variancePct = null;
            }
          }
        }
      }
    }

    const materialVariance = Math.round((materialActual - materialBudget) * 100) / 100;
    const materialVariancePct = materialBudget > 0 ? Math.round((materialVariance / materialBudget) * 100 * 100) / 100 : 0;
    const actualsCompletionPct = materialLinesTotal > 0
      ? Math.round(((materialLinesPurchased + materialLinesSkipped) / materialLinesTotal) * 100 * 100) / 100
      : 0;

    return {
      ...project,
      materialBudget: Math.round(materialBudget * 100) / 100,
      materialActual: Math.round(materialActual * 100) / 100,
      materialVariance,
      materialVariancePct,
      materialLinesTotal,
      materialLinesPurchased,
      materialLinesSkipped,
      materialLinesPending,
      actualsCompletionPct,
      materialActualSpent: Math.round(materialActualSpent * 100) / 100,
    };
  }

  async lockActuals(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);
    if (project.actualsLockedAt) {
      throw AppErrors.badRequest('Smeta a fost deja blocată ("lock-actuals").');
    }

    const enriched = this.computeProjectActualsAndVariance(project);
    const shouldAlert = enriched.materialVariancePct > 15;
    const actualVariance = enriched.materialVariance;
    const actualVariancePct = enriched.materialVariancePct;

    const result = await this.prisma.$transaction(async (tx) => {
      // Pessimistic lock
      await tx.$executeRaw`SELECT id FROM estimate_projects WHERE id = ${id} FOR UPDATE`;

      const stages = await tx.estimateStage.findMany({
        where: { projectId: id },
        include: { lines: true },
      });

      for (const stage of stages) {
        // Update lines
        const linesToUpdate = stage.lines.filter((l) => l.actualLineTotal !== null);
        for (const line of linesToUpdate) {
          await tx.estimateLine.update({
            where: { id: line.id },
            data: {
              unitPrice: line.actualUnitPrice!,
              lineTotal: line.actualLineTotal!,
              source: 'actual',
            },
          });
        }

        // Recalculate stage totals
        const allStageLines = await tx.estimateLine.findMany({
          where: { stageId: stage.id },
        });

        const { laborCost, materialCost } = accumulateEstimateLineTotals(
          allStageLines.map((line) => ({
            unit: line.unit,
            description: line.description,
            lineTotal: line.lineTotal,
          })),
        );
        const stageTotal = round2(laborCost + materialCost);

        await tx.estimateStage.update({
          where: { id: stage.id },
          data: { laborCost, materialCost, stageTotal },
        });
      }

      // Recalculate project totals
      const updatedStages = await tx.estimateStage.findMany({
        where: { projectId: id },
      });

      const laborTotal = round2(updatedStages.reduce((acc, s) => acc + Number(s.laborCost), 0));
      const materialTotal = round2(updatedStages.reduce((acc, s) => acc + Number(s.materialCost), 0));
      const subtotal = laborTotal + materialTotal;
      const marginPct = Number(project.marginPct);
      const grandTotal = round2(subtotal * (1 + marginPct / 100));

      const allProjectLines = await tx.estimateLine.findMany({
        where: { stage: { projectId: id } },
      });

      const tvaAmount = this.calculateTva(
        allProjectLines,
        project.tvaRate,
        marginPct,
      );
      const grandTotalWithVat = round2(grandTotal + tvaAmount);

      await tx.estimateProject.update({
        where: { id },
        data: {
          laborTotal,
          materialTotal,
          grandTotal,
          tvaAmount,
          grandTotalWithVat,
          actualsLockedAt: new Date(),
          version: { increment: 1 },
        },
      });

      const updatedProject = await tx.estimateProject.findUniqueOrThrow({
        where: { id },
        include: projectInclude,
      });

      return this.computeProjectActualsAndVariance(updatedProject);
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

  async unlockActuals(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);

    await this.prisma.estimateProject.update({
      where: { id },
      data: {
        actualsLockedAt: null,
        version: { increment: 1 },
      },
    });

    const updatedProject = await this.access.findProjectOrThrow(user, id);
    return this.computeProjectActualsAndVariance(updatedProject);
  }

  private calculateTva(
    lines: Array<{ lineTotal: any; vatRate?: any | null }>,
    projectTvaRate: any | null,
    marginPct: number,
  ): number {
    const marginFactor = 1 + marginPct / 100;
    let tvaAmount = 0;
    for (const line of lines) {
      const rate = line.vatRate !== null && line.vatRate !== undefined ? Number(line.vatRate) : Number(projectTvaRate ?? 0);
      const lineTotal = Number(line.lineTotal);
      const lineTva = lineTotal * marginFactor * (rate / 100);
      tvaAmount += lineTva;
    }
    return round2(tvaAmount);
  }

  async getVarianceReport(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);

    const enriched = this.computeProjectActualsAndVariance(project);

    const stageReports: Array<{
      id: string;
      name: string;
      sortOrder: number;
      materialBudget: number;
      materialActual: number;
      materialVariance: number;
      materialVariancePct: number;
      lines: Array<{
        id: string;
        description: string;
        kind: 'labor' | 'material';
        budget: number;
        actual: number | null;
        variance: number | null;
        variancePct: number | null;
        actualStatus: string;
      }>;
    }> = [];
    if (project.stages) {
      for (const stage of project.stages) {
        let stageMaterialBudget = 0;
        let stageMaterialActual = 0;
        const lineReports: typeof stageReports[number]['lines'] = [];

        if (stage.lines) {
          for (const line of stage.lines) {
            const isLabor = isEstimateLaborLine({
              unit: line.unit,
              description: line.description,
            });

            const lineBudget = Number(line.lineTotal);
            const lineVariance = line.actualLineTotal !== null ? Number(line.actualLineTotal) - lineBudget : null;
            const lineVariancePct = (lineVariance !== null && lineBudget > 0)
              ? Math.round((lineVariance / lineBudget) * 100 * 100) / 100
              : null;

            if (!isLabor) {
              stageMaterialBudget += lineBudget;
              if (line.actualLineTotal !== null) {
                stageMaterialActual += Number(line.actualLineTotal);
              }
            }

            lineReports.push({
              id: line.id,
              description: line.description,
              kind: isLabor ? 'labor' : 'material',
              budget: lineBudget,
              actual: line.actualLineTotal !== null ? Number(line.actualLineTotal) : null,
              variance: lineVariance,
              variancePct: lineVariancePct,
              actualStatus: line.actualStatus,
            });
          }
        }

        const stageMaterialVariance = stageMaterialActual - stageMaterialBudget;
        const stageMaterialVariancePct = stageMaterialBudget > 0
          ? Math.round((stageMaterialVariance / stageMaterialBudget) * 100 * 100) / 100
          : 0;

        stageReports.push({
          id: stage.id,
          name: stage.name,
          sortOrder: stage.sortOrder,
          materialBudget: round2(stageMaterialBudget),
          materialActual: round2(stageMaterialActual),
          materialVariance: round2(stageMaterialVariance),
          materialVariancePct: stageMaterialVariancePct,
          lines: lineReports,
        });
      }
    }

    const laborBudget = Number(project.laborTotal ?? 0);
    const categories = {
      material: {
        budget: enriched.materialBudget,
        actual: enriched.materialActual,
        variance: enriched.materialVariance,
        variancePct: enriched.materialVariancePct,
      },
      labor: {
        budget: laborBudget,
        actual: laborBudget,
        variance: 0,
        variancePct: 0,
      },
    };

    const companyId = this.ctx.companyId(user);
    const allCompanyProjects = await this.prisma.estimateProject.findMany({
      where: { companyId },
      include: {
        stages: {
          include: { lines: true },
        },
      },
    });

    const mappedProjects = allCompanyProjects
      .map((proj) => {
        const comp = this.computeProjectActualsAndVariance(proj as unknown as EstimateProjectDetail);
        return {
          id: proj.id,
          number: proj.number,
          title: proj.title,
          materialBudget: comp.materialBudget,
          materialActual: comp.materialActual,
          materialVariance: comp.materialVariance,
          materialVariancePct: comp.materialVariancePct,
        };
      })
      .filter((p) => p.materialVariance > 0 && p.id !== id)
      .sort((a, b) => b.materialVariance - a.materialVariance)
      .slice(0, 5);

    return {
      project: {
        id: project.id,
        number: project.number,
        title: project.title,
        status: project.status,
        actualsLockedAt: project.actualsLockedAt,
      },
      metrics: {
        materialBudget: enriched.materialBudget,
        materialActual: enriched.materialActual,
        materialVariance: enriched.materialVariance,
        materialVariancePct: enriched.materialVariancePct,
      },
      stages: stageReports,
      categories,
      topOverruns: mappedProjects,
    };
  }
}
