import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectActualsService } from '../../services/projects/estimate-project-actuals.service';
import { EstimateProjectAccessService } from '../../services/projects/estimate-project-access.service';
import { isEstimateLaborLine } from '../../utils/estimate-line-recalculate.util';
import { round2, type EstimateProjectDetail } from '../../estimate.constants';
import type { VarianceStageReport, VarianceBreakdown } from '../../domain/services/variance-calculator.service';

@Injectable()
export class GetVarianceReportQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly actuals: EstimateProjectActualsService,
  ) {}

  async execute(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);

    const enriched = this.actuals.computeProjectActualsAndVariance(project);

    const stageReports: VarianceStageReport[] = [];
    if (project.stages) {
      for (const stage of project.stages) {
        let stageMaterialBudget = 0;
        let stageMaterialActual = 0;
        const lineReports: VarianceStageReport['lines'] = [];

        if (stage.lines) {
          for (const line of stage.lines) {
            const isLabor = isEstimateLaborLine({ unit: line.unit, description: line.description });
            const lineBudget = Number(line.lineTotal);
            const lineVariance = line.actualLineTotal !== null ? Number(line.actualLineTotal) - lineBudget : null;
            const lineVariancePct = (lineVariance !== null && lineBudget > 0)
              ? Math.round((lineVariance / lineBudget) * 100 * 100) / 100 : null;

            if (!isLabor) {
              stageMaterialBudget += lineBudget;
              if (line.actualLineTotal !== null) stageMaterialActual += Number(line.actualLineTotal);
            }

            lineReports.push({
              id: line.id, description: line.description,
              kind: isLabor ? 'labor' : 'material' as const,
              budget: lineBudget, actual: line.actualLineTotal !== null ? Number(line.actualLineTotal) : null,
              variance: lineVariance, variancePct: lineVariancePct,
              actualStatus: line.actualStatus,
            });
          }
        }

        const stageMaterialVariance = stageMaterialActual - stageMaterialBudget;
        const stageMaterialVariancePct = stageMaterialBudget > 0
          ? Math.round((stageMaterialVariance / stageMaterialBudget) * 100 * 100) / 100 : 0;

        stageReports.push({
          id: stage.id, name: stage.name, sortOrder: stage.sortOrder,
          materialBudget: round2(stageMaterialBudget), materialActual: round2(stageMaterialActual),
          materialVariance: round2(stageMaterialVariance), materialVariancePct: stageMaterialVariancePct,
          lines: lineReports,
        });
      }
    }

    const laborBudget = Number(project.laborTotal ?? 0);
    const categories = {
      material: { budget: enriched.materialBudget, actual: enriched.materialActual, variance: enriched.materialVariance, variancePct: enriched.materialVariancePct },
      labor: { budget: laborBudget, actual: laborBudget, variance: 0, variancePct: 0 },
    };

    const companyId = this.ctx.companyId(user);
    const allCompanyProjects = await this.prisma.estimateProject.findMany({
      where: { companyId },
      include: { stages: { include: { lines: true } } },
    });

    const mappedProjects = allCompanyProjects
      .map((proj) => {
        const comp = this.actuals.computeProjectActualsAndVariance(proj as unknown as EstimateProjectDetail);
        return {
          id: proj.id, number: proj.number, title: proj.title,
          materialBudget: comp.materialBudget, materialActual: comp.materialActual,
          materialVariance: comp.materialVariance, materialVariancePct: comp.materialVariancePct,
        };
      })
      .filter((p) => p.materialVariance > 0 && p.id !== id)
      .sort((a, b) => b.materialVariance - a.materialVariance)
      .slice(0, 5);

    return {
      project: { id: project.id, number: project.number, title: project.title, status: project.status, actualsLockedAt: project.actualsLockedAt },
      metrics: { materialBudget: enriched.materialBudget, materialActual: enriched.materialActual, materialVariance: enriched.materialVariance, materialVariancePct: enriched.materialVariancePct },
      stages: stageReports, categories, topOverruns: mappedProjects,
    };
  }
}