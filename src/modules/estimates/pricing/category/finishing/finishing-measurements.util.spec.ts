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

  it('auto-derives putty, preparation & paint from the room skin for default modules', () => {
    const result = deriveFinisajMeasurements(
      null,
      { finishArea: 30, wallHeight: 2.7, enabledWorkModules: ['surface_preparation', 'putty', 'paint'] },
      {},
    );
    expect(result.wallArea).toBe(75);
    expect(result.puttyArea).toBe(105);
    expect(result.preparationArea).toBe(105);
    expect(result.paintArea).toBe(105);
    expect(result.puttyAreaLabor).toBe(105);
  });

  it('scales wall area by ceiling height (wallHeight is no longer dead)', () => {
    const tall = deriveFinisajMeasurements(
      null,
      { finishArea: 30, wallHeight: 3.0, enabledWorkModules: ['putty'] },
      {},
    );
    expect(tall.wallArea).toBe(round2(30 * 2.5 * (3.0 / 2.7)));
    expect(tall.wallArea).toBeGreaterThan(75);
  });

  it('estimates baseboard length from perimeter (4·√area)', () => {
    const result = deriveFinisajMeasurements(
      null,
      { finishArea: 30, enabledWorkModules: ['baseboards'] },
      {},
    );
    expect(result.baseboardLengthM).toBe(round2(4 * Math.sqrt(30)));
  });

  it('subtracts wallpaper & decorative plaster from the auto paint area', () => {
    const result = deriveFinisajMeasurements(
      null,
      {
        finishArea: 30,
        wallHeight: 2.7,
        wallpaperArea: 20,
        decorativePlasterArea: 10,
        enabledWorkModules: ['paint', 'wallpaper', 'decorative_plaster'],
      },
      {},
    );
    expect(result.paintArea).toBe(75);
  });

  it('derives new module quantities (stretch ceiling auto, partition explicit)', () => {
    const result = deriveFinisajMeasurements(
      null,
      { finishArea: 40, partitionArea: 12, enabledWorkModules: ['stretch_ceiling', 'partition'] },
      {},
    );
    expect(result.stretchCeilingArea).toBe(40);
    expect(result.partitionArea).toBe(12);
    expect(result.partitionAreaLabor).toBe(12);
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

  it('applies company pricing-modifier overrides to the complexity multiplier', () => {
    const diagnostic = {
      finishArea: 30,
      surfaceCondition: 'old',
      finishLevel: 'premium',
      enabledWorkModules: ['paint'],
    };
    expect(deriveFinisajMeasurements(null, diagnostic, {}).complexityMultiplier).toBe(1.3);
    const overridden = deriveFinisajMeasurements(null, diagnostic, {}, {
      'finishing.surfaceCondition.old': 25,
      'finishing.finishLevel.premium': 30,
    });
    expect(overridden.complexityMultiplier).toBe(round2(1.25 + 0.3));
    expect(resolveSurfaceConditionMultiplier('old', { 'finishing.surfaceCondition.old': 25 })).toBeCloseTo(1.25, 5);
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
