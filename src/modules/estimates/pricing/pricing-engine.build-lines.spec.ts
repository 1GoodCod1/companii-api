import type { EstimateBlueprintConfig } from '../../../../prisma/estimate-blueprint-config.types';
import { lucrariFinisajBlueprint } from '../../../../prisma/estimate-blueprints/categories/lucrari-finisaj.blueprint';
import { deriveFinisajMeasurements } from './category/finishing/finishing-measurements.util';
import { EstimatePricingEngine } from './pricing-engine.service';

describe('EstimatePricingEngine.buildLinesFromRules (E-02, E-04)', () => {
  const engine = new EstimatePricingEngine();

  it('E-02: paint-only finishing produces zero tile lines', () => {
    const measurements = deriveFinisajMeasurements(
      null,
      { finishArea: 40, paintArea: 100, enabledWorkModules: ['paint'] },
      {},
    );

    const lines = engine.buildLinesFromRules(lucrariFinisajBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['paint'],
      config: lucrariFinisajBlueprint as EstimateBlueprintConfig,
    });

    const descriptions = lines.map((line) => line.description.toLowerCase());
    expect(descriptions.some((d) => d.includes('gresie') || d.includes('faian'))).toBe(false);
    expect(descriptions.some((d) => d.includes('pardoseal'))).toBe(false);
    expect(descriptions.some((d) => d.includes('vopsire'))).toBe(true);
  });

  it('E-04: applies wastePct to generated line quantity', () => {
    const lines = engine.buildLinesFromRules(
      [
        {
          stageCode: 'material',
          description: 'Test material with waste',
          unit: 'm²',
          qtyKey: 'testArea',
          unitPrice: 100,
          wastePct: 10,
          kind: 'material',
        },
      ],
      { testArea: 10 },
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]?.qty).toBe(11);
    expect(lines[0]?.lineTotal).toBe(1100);
  });
});
