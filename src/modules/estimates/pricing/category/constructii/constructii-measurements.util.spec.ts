import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  deriveConstructiiMeasurements,
  resolveFoundationConcreteM3,
  shouldRequireConstructiiManualReview,
} from './constructii-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { constructiiBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/constructii.blueprint';

describe('Construction measurements (constructii)', () => {
  it('computes builtAreaTotal and default volume formulas', () => {
    const result = deriveConstructiiMeasurements(
      null,
      { builtArea: 100, storyCount: 2, foundationType: 'strip' },
      {},
    );

    expect(result.builtAreaTotal).toBe(200);
    expect(result.excavationVolumeM3).toBe(45);
    expect(result.concreteVolumeM3).toBe(18);
    expect(result.rebarKg).toBe(1620);
    expect(result.masonryVolumeM3).toBe(44);
    expect(result.foundationConcreteM3).toBe(14);
  });

  it('uses manual volume overrides when provided', () => {
    const result = deriveConstructiiMeasurements(
      null,
      {
        builtArea: 80,
        storyCount: 1,
        excavationVolumeM3: 60,
        concreteVolumeM3: 25,
        rebarKg: 3000,
        masonryVolumeM3: 30,
      },
      {},
    );

    expect(result.excavationVolumeM3).toBe(60);
    expect(result.concreteVolumeM3).toBe(25);
    expect(result.rebarKg).toBe(3000);
    expect(result.masonryVolumeM3).toBe(30);
  });

  it('derives foundation concrete by foundation type', () => {
    expect(resolveFoundationConcreteM3('slab', 100)).toBe(18);
    expect(resolveFoundationConcreteM3('pile', 100)).toBe(6);
    expect(resolveFoundationConcreteM3('isolated', 100)).toBe(10);
  });

  it('flags manual review for large buildings, multi-story, or pile foundation', () => {
    expect(shouldRequireConstructiiManualReview(151, 1, 'strip')).toBe(true);
    expect(shouldRequireConstructiiManualReview(100, 3, 'strip')).toBe(true);
    expect(shouldRequireConstructiiManualReview(80, 1, 'pile')).toBe(true);

    const pileResult = deriveConstructiiMeasurements(
      null,
      { builtArea: 80, storyCount: 1, foundationType: 'pile' },
      {},
    );
    expect(pileResult.requiresManualReview).toBe(1);
  });

  it('marks MVP estimates as preliminary', () => {
    const result = deriveConstructiiMeasurements(
      null,
      { builtArea: 60, storyCount: 1 },
      {},
    );
    expect(result.preliminaryEstimate).toBe(1);
  });

  it('gates roof and utilities lines by optional modules', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveConstructiiMeasurements(
      null,
      {
        builtArea: 90,
        storyCount: 2,
        roofIncluded: true,
        utilitiesIncluded: false,
      },
      {},
    );

    const roofLines = engine.buildLinesFromRules(constructiiBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['roof'],
      config: constructiiBlueprint as EstimateBlueprintConfig,
    });
    const utilityLines = engine.buildLinesFromRules(constructiiBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['utilities'],
      config: constructiiBlueprint as EstimateBlueprintConfig,
    });

    expect(roofLines.some((line) => line.description.toLowerCase().includes('acoperi'))).toBe(true);
    expect(utilityLines).toHaveLength(0);
  });
});
