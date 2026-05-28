import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  deriveFinisajMeasurements,
  resolveFinisajComplexityMultiplier,
  resolveSurfaceConditionMultiplier,
} from './finishing-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { lucrariFinisajBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/lucrari-finisaj.blueprint';

describe('finishing measurements (lucrari-finisaj)', () => {
  it('computes wall, ceiling and paint areas when paint and ceiling modules are enabled', () => {
    const result = deriveFinisajMeasurements(
      { rooms: [{ id: '1', name: 'Living', width: 5, height: 6 }], points: [] },
      {
        finishArea: 30,
        wallHeight: 2.7,
        surfaceCondition: 'old',
        finishLevel: 'premium',
        enabledWorkModules: ['paint', 'ceiling'],
      },
      {},
    );

    expect(result.wallArea).toBe(75);
    expect(result.ceilingArea).toBe(30);
    expect(result.paintArea).toBe(105);
    expect(result.complexityMultiplier).toBe(1.3);
    expect(result.paintAreaLabor).toBe(round2(105 * 1.3));
    expect(result.tileArea).toBe(0);
  });

  it('keeps optional module areas at zero unless explicitly set or module enabled', () => {
    const result = deriveFinisajMeasurements(null, { finishArea: 40 }, {});

    expect(result.tileArea).toBe(0);
    expect(result.flooringArea).toBe(0);
    expect(result.drywallArea).toBe(0);
    expect(result.paintArea).toBe(0);
  });

  it('E-01: engine does not fallback tileArea from finishArea when tile module is disabled', () => {
    const engine = new EstimatePricingEngine();
    const measurements = engine.deriveMeasurements(
      null,
      { finishArea: 50, enabledWorkModules: ['paint'] },
      'lucrari-finisaj',
    );

    expect(measurements.tileArea).toBe(0);
    expect(measurements.flooringArea).toBe(0);
    expect(measurements.drywallArea).toBe(0);
    expect(measurements.screedArea).toBe(0);
  });

  it('maps surface condition multipliers', () => {
    expect(resolveSurfaceConditionMultiplier('new')).toBe(1.0);
    expect(resolveSurfaceConditionMultiplier('old')).toBe(1.15);
    expect(resolveSurfaceConditionMultiplier('very_bad')).toBe(1.35);
    expect(resolveFinisajComplexityMultiplier('new', 'premium')).toBe(1.15);
  });

  it('creates paint lines only when paint module is enabled', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveFinisajMeasurements(null, { finishArea: 25, paintArea: 80 }, {});

    const paintOnly = engine.buildLinesFromRules(lucrariFinisajBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['paint'],
      config: lucrariFinisajBlueprint as EstimateBlueprintConfig,
    });
    const descriptions = paintOnly.map((line) => line.description);
    expect(descriptions.some((d) => d.toLowerCase().includes('vopsire'))).toBe(true);
    expect(descriptions.some((d) => d.toLowerCase().includes('gresie'))).toBe(false);
    expect(descriptions.some((d) => d.toLowerCase().includes('pardoseal'))).toBe(false);
    expect(descriptions.some((d) => d.toLowerCase().includes('gips'))).toBe(false);
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
