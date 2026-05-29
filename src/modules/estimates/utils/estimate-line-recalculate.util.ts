import { round2 } from '../estimate.constants';

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

type LineCostInput = {
  unit: string;
  description: string;
  lineTotal: number | { toString(): string };
  kind?: 'labor' | 'material';
};

export function isEstimateLaborLine(line: Pick<LineCostInput, 'unit' | 'description' | 'kind'>): boolean {
  if (line.kind === 'labor') return true;
  if (line.kind === 'material') return false;
  const description = line.description.toLowerCase();
  return (
    line.unit === 'ore' ||
    description.includes('manoperă') ||
    description.includes('manopera') ||
    description.includes('lucrări') ||
    description.includes('lucrari') ||
    description.includes('labor')
  );
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
