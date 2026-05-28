import {
  RECALCULATED_ESTIMATE_LINE_SOURCES,
  accumulateEstimateLineTotals,
  isRecalculatedEstimateLineSource,
  nextRuleLineSortOrder,
} from './estimate-line-recalculate.util';

describe('estimate-line-recalculate.util (E-03)', () => {
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
});
