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

  describe('Slice 2: accessDifficulty multiplier', () => {
    const rules: EstimateBlueprintConfig['pricingRules'] = [
      {
        stageCode: 'montaj',
        description: 'Manoperă montaj',
        unit: 'buc',
        qtyKey: 'q',
        unitPrice: 100,
        kind: 'labor',
      },
      {
        stageCode: 'montaj',
        description: 'Material',
        unit: 'buc',
        qtyKey: 'q',
        unitPrice: 200,
        kind: 'material',
      },
    ];

    it('applies labor multiplier only by default (materialMultiplier=1)', () => {
      const lines = engine.buildLinesFromRules(rules, { q: 5 }, {
        laborMultiplier: 1.25,
        materialMultiplier: 1,
      });
      const labor = lines.find((l) => l.kind === 'labor')!;
      const material = lines.find((l) => l.kind === 'material')!;
      expect(labor.unitPrice).toBe(125); // 100 * 1.25
      expect(labor.lineTotal).toBe(625);
      expect(material.unitPrice).toBe(200); // unchanged
      expect(material.lineTotal).toBe(1000);
    });

    it('applies material multiplier when materialMultiplier > 1', () => {
      const lines = engine.buildLinesFromRules(rules, { q: 5 }, {
        laborMultiplier: 1.4,
        materialMultiplier: 1.4,
      });
      const labor = lines.find((l) => l.kind === 'labor')!;
      const material = lines.find((l) => l.kind === 'material')!;
      expect(labor.unitPrice).toBe(140);
      expect(material.unitPrice).toBe(280);
    });

    it('multiplier of 1.0 keeps unitPrice identical', () => {
      const lines = engine.buildLinesFromRules(rules, { q: 5 });
      expect(lines[0].unitPrice).toBe(100);
      expect(lines[1].unitPrice).toBe(200);
    });

    it('Slice 3: composed access × urgency (santehnika emergency in difficult access)', () => {
      // Caller composes: access 1.25 (santehnika difficult) × urgency 1.8 (santehnika emergency) = 2.25
      const lines = engine.buildLinesFromRules(rules, { q: 5 }, {
        laborMultiplier: 2.25,
      });
      const labor = lines.find((l) => l.kind === 'labor')!;
      expect(labor.unitPrice).toBe(225); // 100 * 2.25
    });
  });
});
