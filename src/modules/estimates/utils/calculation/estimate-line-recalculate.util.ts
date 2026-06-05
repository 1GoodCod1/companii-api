import { round2 } from '../../estimate.constants';

/** Line sources replaced on each calculate(); manual lines are preserved (E-03). */
export const RECALCULATED_ESTIMATE_LINE_SOURCES = [
  'rule',
  'stage-default',
  'custom-total-override',
] as const;

export type RecalculatedEstimateLineSource = (typeof RECALCULATED_ESTIMATE_LINE_SOURCES)[number];

export function isRecalculatedEstimateLineSource(source: string): source is RecalculatedEstimateLineSource {
  return (RECALCULATED_ESTIMATE_LINE_SOURCES as readonly string[]).includes(source);
}

export const CUSTOM_LABOR_TOTAL_OVERRIDE_DESCRIPTION_PREFIX = 'Cost Lucrări (Volum / Contract)';

export function stageHasManualCustomLaborTotalOverride(
  manualLines: Array<{ description: string }>,
): boolean {
  return manualLines.some((line) =>
    line.description.includes(CUSTOM_LABOR_TOTAL_OVERRIDE_DESCRIPTION_PREFIX),
  );
}

export function shouldPromoteRecalculatedLineToManual(
  source: string,
  data: { qty?: number; unit?: string; unitPrice?: number; description?: string },
): boolean {
  if (!isRecalculatedEstimateLineSource(source)) return false;
  return (
    data.qty !== undefined ||
    data.unit !== undefined ||
    data.unitPrice !== undefined ||
    data.description !== undefined
  );
}

type LineCostInput = {
  unit: string;
  description: string;
  lineTotal: number | { toString(): string };
  kind?: 'labor' | 'material';
  stageKind?: string;
};

export function isEstimateLaborLine(line: {
  unit: string;
  description: string;
  kind?: string;
  stageKind?: string;
}): boolean {
  if (line.kind === 'labor') return true;
  if (line.kind === 'material') return false;

  const description = line.description.toLowerCase();
  if (
    description.includes('(material)') ||
    description.includes('material') ||
    description.includes('materiale') ||
    description.includes('componente') ||
    description.includes('component') ||
    description.includes('piese') ||
    description.includes('licen')
  ) {
    return false;
  }

  const laborByHeuristic =
    line.unit === 'ore' ||
    line.unit === 'h' ||
    description.includes('manoperă') ||
    description.includes('manopera') ||
    description.includes('lucrări') ||
    description.includes('lucrari') ||
    description.includes('labor') ||
    description.includes('dezvoltare') ||
    description.includes('design') ||
    description.includes('audit') ||
    description.includes('testare') ||
    description.includes('instruire') ||
    description.includes('suport') ||
    description.includes('migrare') ||
    description.includes('configurare') ||
    description.includes('instalare') ||
    description.includes('diagnostic') ||
    description.includes('asamblare pc (lucrări)') ||
    description.includes('asamblare pc (lucrari)');

  if (laborByHeuristic) return true;
  if (line.stageKind === 'MATERIAL') return false;

  return false;
}

export function accumulateEstimateLineTotals(lines: LineCostInput[]): {
  laborCost: number;
  materialCost: number;
} {
  let laborCost = 0;
  let materialCost = 0;

  for (const line of lines) {
    const total = Number(line.lineTotal);
    if (isEstimateLaborLine(line)) laborCost += total;
    else materialCost += total;
  }

  return { laborCost: round2(laborCost), materialCost: round2(materialCost) };
}

export function nextRuleLineSortOrder(existingLines: Array<{ sortOrder: number }>): number {
  if (!existingLines.length) return 0;
  return Math.max(...existingLines.map((line) => line.sortOrder)) + 1;
}

export function calculateTva(
  lines: Array<{ lineTotal: any; vatRate?: any | null }>,
  projectTvaRate: any | null,
  marginPct: number,
  riskReservePct = 0,
): number {
  const priceFactor = (1 + riskReservePct / 100) * (1 + marginPct / 100);
  let tvaAmount = 0;
  for (const line of lines) {
    const rate = line.vatRate !== null && line.vatRate !== undefined ? Number(line.vatRate) : Number(projectTvaRate ?? 0);
    const lineTotal = Number(line.lineTotal);
    const lineTva = lineTotal * priceFactor * (rate / 100);
    tvaAmount += lineTva;
  }
  return round2(tvaAmount);
}

