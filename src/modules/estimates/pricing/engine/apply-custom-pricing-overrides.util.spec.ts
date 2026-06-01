import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprint-config.types';
import { lucrariFinisajBlueprint } from '../../../../../prisma/estimate-blueprints/categories/lucrari-finisaj.blueprint';
import { applyCustomPricingOverrides } from './apply-custom-pricing-overrides.util';

describe('applyCustomPricingOverrides', () => {
  const config = lucrariFinisajBlueprint as EstimateBlueprintConfig;
  const stages = config.defaultStages.map((stage) => ({ code: stage.code }));

  it('passes through customLaborTotal without modifying rules', () => {
    const result = applyCustomPricingOverrides(
      config,
      { finishArea: 40 },
      { customLaborTotal: 4000 },
      config.pricingRules,
      stages,
      'lucrari-finisaj',
    );

    expect(result.customLaborTotal).toBe(4000);
    expect(result.rules).toEqual(config.pricingRules);
  });

  it('injects laborHours rule when customLaborHours is set and no laborHours rule exists', () => {
    const result = applyCustomPricingOverrides(
      config,
      { finishArea: 40 },
      { customLaborHours: 16 },
      config.pricingRules,
      stages,
      'lucrari-finisaj',
    );

    expect(result.measurements.laborHours).toBe(16);
    expect(result.rules.some((rule) => rule.qtyKey === 'laborHours')).toBe(true);
  });

  it('overrides m² labor unit prices when customUnitPriceSqm is set', () => {
    const result = applyCustomPricingOverrides(
      config,
      { finishArea: 40, paintArea: 40 },
      { customUnitPriceSqm: 99 },
      config.pricingRules,
      stages,
      'lucrari-finisaj',
    );

    const sqmLaborRules = result.rules.filter((rule) => rule.unit === 'm²' && rule.kind === 'labor');
    expect(sqmLaborRules.length).toBeGreaterThan(0);
    expect(sqmLaborRules.every((rule) => rule.unitPrice === 99)).toBe(true);
  });
});
