import { round2 } from '../../estimate.constants';
import { isEstimateLaborLine } from '../../utils/estimate-line-recalculate.util';

export interface RecalculatedLine {
  stageCode: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  source: string;
  kind: 'labor' | 'material';
}

export interface RecalculationResult {
  stages: Array<{
    id: string;
    laborCost: number;
    materialCost: number;
    stageTotal: number;
  }>;
  laborTotal: number;
  materialTotal: number;
  grandTotal: number;
  tvaAmount: number;
  grandTotalWithVat: number;
}

export class LineRecalculatorService {
  recalculateStage(lines: Array<{ unit: string; description: string; lineTotal: number; kind?: 'labor' | 'material' }>): {
    laborCost: number;
    materialCost: number;
    stageTotal: number;
  } {
    let laborCost = 0;
    let materialCost = 0;
    for (const line of lines) {
      const total = Number(line.lineTotal);
      if (isEstimateLaborLine(line)) laborCost += total;
      else materialCost += total;
    }
    laborCost = round2(laborCost);
    materialCost = round2(materialCost);
    return { laborCost, materialCost, stageTotal: round2(laborCost + materialCost) };
  }

  recalculateProject(
    stages: Array<{ laborCost: number; materialCost: number }>,
    marginPct: number,
    riskReservePct: number,
    tvaRate: number,
    allLines: Array<{ lineTotal: number; vatRate?: number | null }>,
  ): RecalculationResult {
    const laborTotal = round2(stages.reduce((acc, s) => acc + s.laborCost, 0));
    const materialTotal = round2(stages.reduce((acc, s) => acc + s.materialCost, 0));
    const subtotal = laborTotal + materialTotal;
    const grandTotal = round2(subtotal * (1 + riskReservePct / 100) * (1 + marginPct / 100));
    const priceFactor = (1 + riskReservePct / 100) * (1 + marginPct / 100);
    let tvaAmount = 0;
    for (const line of allLines) {
      const rate = line.vatRate !== null && line.vatRate !== undefined ? Number(line.vatRate) : tvaRate;
      tvaAmount += Number(line.lineTotal) * priceFactor * (rate / 100);
    }
    tvaAmount = round2(tvaAmount);

    return {
      stages: stages.map((s) => ({
        id: '',
        ...s,
        stageTotal: round2(s.laborCost + s.materialCost),
      })),
      laborTotal,
      materialTotal,
      grandTotal,
      tvaAmount,
      grandTotalWithVat: round2(grandTotal + tvaAmount),
    };
  }
}