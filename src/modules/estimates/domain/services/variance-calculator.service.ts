import { round2 } from '../../estimate.constants';

export interface VarianceBreakdown {
  materialBudget: number;
  materialActual: number;
  materialVariance: number;
  materialVariancePct: number;
  materialLinesTotal: number;
  materialLinesPurchased: number;
  materialLinesSkipped: number;
  materialLinesPending: number;
  actualsCompletionPct: number;
  materialActualSpent: number;
}

export interface VarianceLineReport {
  id: string;
  description: string;
  kind: 'labor' | 'material';
  budget: number;
  actual: number | null;
  variance: number | null;
  variancePct: number | null;
  actualStatus: string;
}

export interface VarianceStageReport {
  id: string;
  name: string;
  sortOrder: number;
  materialBudget: number;
  materialActual: number;
  materialVariance: number;
  materialVariancePct: number;
  lines: VarianceLineReport[];
}

export class VarianceCalculatorService {
  computeVariance(lines: Array<{
    lineTotal: number;
    actualLineTotal: number | null;
    actualStatus: string | null;
    unit: string;
    description: string;
    kind?: string;
  }>): VarianceBreakdown {
    let materialBudget = 0;
    let materialActual = 0;
    let materialActualSpent = 0;
    let materialLinesTotal = 0;
    let materialLinesPurchased = 0;
    let materialLinesSkipped = 0;
    let materialLinesPending = 0;

    for (const line of lines) {
      const isLabor = line.kind === 'labor' ||
        line.unit === 'ore' ||
        line.description.toLowerCase().includes('manoperă') ||
        line.description.toLowerCase().includes('manopera') ||
        line.description.toLowerCase().includes('lucrări') ||
        line.description.toLowerCase().includes('lucrari') ||
        line.description.toLowerCase().includes('labor');

      if (isLabor) continue;

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
        materialActual += Number(line.actualLineTotal ?? 0);
      } else if (line.actualStatus === 'SKIPPED') {
        materialLinesSkipped++;
      } else if (line.actualStatus === 'PENDING') {
        materialLinesPending++;
      }
    }

    const materialVariance = Math.round((materialActual - materialBudget) * 100) / 100;
    const materialVariancePct = materialBudget > 0
      ? Math.round((materialVariance / materialBudget) * 100 * 100) / 100
      : 0;
    const actualsCompletionPct = materialLinesTotal > 0
      ? Math.round(((materialLinesPurchased + materialLinesSkipped) / materialLinesTotal) * 100 * 100) / 100
      : 0;

    return {
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

  buildStageReports(
    stages: Array<{
      id: string;
      name: string;
      sortOrder: number;
      lines: Array<{
        id: string;
        lineTotal: number;
        actualLineTotal: number | null;
        actualStatus: string;
        unit: string;
        description: string;
        kind?: string;
      }>;
    }>,
  ): VarianceStageReport[] {
    return stages.map((stage) => {
      let stageMaterialBudget = 0;
      let stageMaterialActual = 0;
      const lineReports: VarianceLineReport[] = [];

      for (const line of stage.lines) {
        const isLabor = line.kind === 'labor' ||
          line.unit === 'ore' ||
          line.description.toLowerCase().includes('manoperă') ||
          line.description.toLowerCase().includes('manopera') ||
          line.description.toLowerCase().includes('lucrări') ||
          line.description.toLowerCase().includes('lucrari') ||
          line.description.toLowerCase().includes('labor');

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

      const stageMaterialVariance = stageMaterialActual - stageMaterialBudget;
      const stageMaterialVariancePct = stageMaterialBudget > 0
        ? Math.round((stageMaterialVariance / stageMaterialBudget) * 100 * 100) / 100
        : 0;

      return {
        id: stage.id,
        name: stage.name,
        sortOrder: stage.sortOrder,
        materialBudget: round2(stageMaterialBudget),
        materialActual: round2(stageMaterialActual),
        materialVariance: round2(stageMaterialVariance),
        materialVariancePct: stageMaterialVariancePct,
        lines: lineReports,
      };
    });
  }
}