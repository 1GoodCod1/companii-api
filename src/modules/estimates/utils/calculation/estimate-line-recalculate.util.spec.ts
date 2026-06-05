import {
  RECALCULATED_ESTIMATE_LINE_SOURCES,
  accumulateEstimateLineTotals,
  isEstimateLaborLine,
  isRecalculatedEstimateLineSource,
  nextRuleLineSortOrder,
  shouldPromoteRecalculatedLineToManual,
  stageHasManualCustomLaborTotalOverride,
} from './estimate-line-recalculate.util';

describe('estimate-line-recalculate.util (E-03)', () => {
  it('detects labor lines with IT keywords and stageKind', () => {
    expect(isEstimateLaborLine({ unit: 'buc', description: 'Dezvoltare frontend per pagină' })).toBe(true);
    expect(isEstimateLaborLine({ unit: 'buc', description: 'Design UI/UX Premium' })).toBe(true);
    expect(isEstimateLaborLine({ unit: 'buc', description: 'Random item', stageKind: 'LABOR' })).toBe(true);
    expect(isEstimateLaborLine({ unit: 'ore', description: 'lucrări', stageKind: 'MATERIAL' })).toBe(false);
  });

  it('defines recalculated line sources', () => {
    expect(RECALCULATED_ESTIMATE_LINE_SOURCES).toEqual([
      'rule',
      'stage-default',
      'custom-total-override',
    ]);
    expect(isRecalculatedEstimateLineSource('manual')).toBe(false);
    expect(isRecalculatedEstimateLineSource('rule')).toBe(true);
  });

  it('accumulates manual line totals into stage costs', () => {
    const totals = accumulateEstimateLineTotals([
      {
        description: 'Extra manual',
        unit: 'buc',
        lineTotal: 250,
        kind: 'material',
      },
      {
        description: 'Manoperă suplimentară',
        unit: 'ore',
        lineTotal: 180,
      },
    ]);

    expect(totals).toEqual({ laborCost: 180, materialCost: 250 });
  });

  it('places new rule lines after manual sortOrder', () => {
    expect(nextRuleLineSortOrder([])).toBe(0);
    expect(nextRuleLineSortOrder([{ sortOrder: 0 }, { sortOrder: 5 }])).toBe(6);
  });

  it('detects manual custom labor override lines for recalculate skip', () => {
    expect(
      stageHasManualCustomLaborTotalOverride([
        { description: 'Cost Lucrări (Volum / Contract) — Montaj aparataj' },
      ]),
    ).toBe(true);
    expect(stageHasManualCustomLaborTotalOverride([{ description: 'Extra manual' }])).toBe(false);
  });

  it('promotes recalculated lines to manual when pricing fields are edited', () => {
    expect(
      shouldPromoteRecalculatedLineToManual('custom-total-override', { qty: 6 }),
    ).toBe(true);
    expect(
      shouldPromoteRecalculatedLineToManual('custom-total-override', { unit: 'ore' }),
    ).toBe(true);
    expect(shouldPromoteRecalculatedLineToManual('manual', { qty: 6 })).toBe(false);
    expect(shouldPromoteRecalculatedLineToManual('custom-total-override', {})).toBe(false);
  });
});
