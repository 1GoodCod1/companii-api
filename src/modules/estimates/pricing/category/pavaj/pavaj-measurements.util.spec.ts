import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  derivePavajMeasurements,
  resolveLoadMultiplier,
  resolvePatternMultiplier,
} from './pavaj-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { pavajBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/pavaj.blueprint';

describe('Pavement measurements (pavaj)', () => {
  it('computes excavation, gravel, sand and drainage from area formulas', () => {
    const result = derivePavajMeasurements(
      null,
      {
        pavementArea: 40,
        borderLengthM: 30,
        baseLayerCm: 25,
        gravelLayerCm: 15,
        sandLayerCm: 5,
        geotextileRequired: true,
        drainageRequired: true,
      },
      {},
    );

    expect(result.excavationVolumeM3).toBe(10);
    expect(result.gravelVolumeM3).toBe(6);
    expect(result.sandVolumeM3).toBe(2);
    expect(result.geotextileArea).toBe(42);
    expect(result.drainageLengthM).toBe(9);
  });

  it('applies pattern and load multipliers to paving labor qty', () => {
    const simple = derivePavajMeasurements(
      null,
      { pavementArea: 50, borderLengthM: 28, patternComplexity: 'simple', vehicleLoad: 'pedestrian' },
      {},
    );
    const complex = derivePavajMeasurements(
      null,
      { pavementArea: 50, borderLengthM: 28, patternComplexity: 'decorative', vehicleLoad: 'heavy' },
      {},
    );

    expect(resolvePatternMultiplier('mixed')).toBe(1.15);
    expect(resolveLoadMultiplier('car')).toBe(1.15);
    expect(simple.pavementLaborQty).toBe(50);
    expect(complex.pavementLaborQty).toBe(roundExpected(50 * 1.3 * 1.35));
    expect(complex.gravelVolumeM3).toBeGreaterThan(simple.gravelVolumeM3);
  });

  it('estimates border length from pavement area when missing', () => {
    const result = derivePavajMeasurements(null, { pavementArea: 100 }, {});
    expect(result.borderLengthM).toBe(40);
  });

  it('keeps removal and paving lines separated by work modules', () => {
    const engine = new EstimatePricingEngine();
    const measurements = derivePavajMeasurements(
      null,
      {
        pavementArea: 35,
        borderLengthM: 24,
        oldSurfaceRemovalArea: 35,
        drainageRequired: true,
      },
      {},
    );

    const removalLines = engine.buildLinesFromRules(pavajBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['removal'],
      config: pavajBlueprint as EstimateBlueprintConfig,
    });
    const pavingLines = engine.buildLinesFromRules(pavajBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['paving'],
      config: pavajBlueprint as EstimateBlueprintConfig,
    });

    expect(removalLines.some((line) => line.description.toLowerCase().includes('demontare'))).toBe(true);
    expect(pavingLines.some((line) => line.description.toLowerCase().includes('pavele'))).toBe(true);
    expect(removalLines.some((line) => line.description.toLowerCase().includes('pavele'))).toBe(false);
  });
});

function roundExpected(value: number): number {
  return Math.round(value * 100) / 100;
}
