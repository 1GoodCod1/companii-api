import {
  minPlanForFeature,
  PLAN_MARKETING_FEATURES,
  planHasFeature,
  plansForFeature,
} from './plan-entitlements.constants';

describe('plan-entitlements.constants', () => {
  it('allows FREE plan for interventions and calendar', () => {
    expect(planHasFeature('FREE', 'interventions')).toBe(true);
    expect(planHasFeature('FREE', 'calendar')).toBe(true);
    expect(planHasFeature('FREE', 'customers')).toBe(false);
  });

  it('requires PRO for CRM features', () => {
    expect(minPlanForFeature('customers')).toBe('PRO');
    expect(plansForFeature('customers')).toEqual(['PRO', 'BUSINESS']);
  });

  it('requires BUSINESS for estimates and invoices', () => {
    expect(planHasFeature('PRO', 'estimates')).toBe(false);
    expect(planHasFeature('BUSINESS', 'invoices')).toBe(true);
  });

  it('exposes catalog metadata for all plans', () => {
    for (const code of ['FREE', 'PRO', 'BUSINESS'] as const) {
      expect(PLAN_MARKETING_FEATURES[code].length).toBeGreaterThan(0);
    }
  });
});
