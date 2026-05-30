import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  deriveConstructiiMeasurements,
  resolveFoundationConcreteM3,
  resolveStructuralConcreteM3,
  shouldRequireConstructiiManualReview,
} from './constructii-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { constructiiBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/constructii.blueprint';
import type { MeasurementMap } from '../category-shared.util';
import { assertNoNaNInMeasurements } from './constructii-parity.vectors';

function expectNoNaNInMeasurements(result: MeasurementMap) {
  assertNoNaNInMeasurements(result as Record<string, number>);
}

describe('Construction measurements (constructii)', () => {
  it('computes builtAreaTotal and splits foundation vs structural concrete', () => {
    const result = deriveConstructiiMeasurements(
      null,
      { builtArea: 100, storyCount: 2, foundationType: 'strip' },
      {},
    );

    expect(result.builtAreaTotal).toBe(200);
    expect(result.excavationVolumeM3).toBe(45);
    expect(result.foundationConcreteM3).toBe(14);
    expect(result.structuralConcreteM3).toBe(22);
    expect(result.concreteVolumeM3).toBe(22);
    expect(result.foundationRebarKg).toBe(1260);
    expect(result.structuralRebarKg).toBe(1980);
    expect(result.rebarKg).toBe(3240);
    expect(result.masonryVolumeM3).toBe(44);
    expectNoNaNInMeasurements(result);
  });

  it('derives slabAreaTotal and scales structural concrete by story count', () => {
    const singleStory = deriveConstructiiMeasurements(
      null,
      { builtArea: 50, storyCount: 1, slabType: 'monolithic' },
      {},
    );
    expect(singleStory.slabAreaTotal).toBe(50);
    expect(singleStory.foundationConcreteM3).toBe(7);
    expect(singleStory.structuralConcreteM3).toBe(2);
    expect(singleStory.rebarKg).toBe(810);
    expectNoNaNInMeasurements(singleStory);

    const multiStory = deriveConstructiiMeasurements(
      null,
      { builtArea: 150, storyCount: 2, slabType: 'monolithic' },
      {},
    );
    expect(multiStory.slabAreaTotal).toBe(300);
    expect(multiStory.structuralConcreteM3).toBe(33);
    expect(multiStory.rebarKg).toBe(4860);
  });

  it('does not double-bill foundation volume in fundatie pricing rules', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveConstructiiMeasurements(
      null,
      { builtArea: 50, storyCount: 1 },
      {},
    );

    const foundationLines = engine.buildLinesFromRules(constructiiBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['foundation'],
      config: constructiiBlueprint as EstimateBlueprintConfig,
    });

    expect(foundationLines.some((line) => line.description.includes('Beton armat fundație'))).toBe(false);

    const livrat = foundationLines.find((line) => line.description.includes('Beton livrat fundație'));
    const cofrare = foundationLines.find((line) => line.description.includes('cofrare & turnare fundație'));
    const rebarMaterial = foundationLines.find((line) => line.description.includes('Armătură oțel fundație'));

    expect(livrat?.qty).toBe(7);
    expect(cofrare?.qty).toBe(7);
    expect(rebarMaterial?.qty).toBe(630);
    expect(foundationLines.every((line) => line.qty === 7 || line.qty === 630)).toBe(true);
  });

  it('bills structural concrete and rebar only in structura stage', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveConstructiiMeasurements(
      null,
      { builtArea: 100, storyCount: 2 },
      {},
    );

    const structureLines = engine.buildLinesFromRules(constructiiBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['structure'],
      config: constructiiBlueprint as EstimateBlueprintConfig,
    });

    const structuralBeton = structureLines.find((line) => line.description.includes('Beton livrat structural'));
    expect(structuralBeton?.qty).toBe(22);

    const foundationLines = engine.buildLinesFromRules(constructiiBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['foundation'],
      config: constructiiBlueprint as EstimateBlueprintConfig,
    });
    expect(foundationLines.some((line) => line.description.includes('structural'))).toBe(false);
  });

  it('produces slab material+labor lines with real area qty and type multiplier in unitPrice', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveConstructiiMeasurements(
      null,
      { builtArea: 50, storyCount: 1 },
      {},
    );

    const lines = engine.buildLinesFromRules(constructiiBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['slab'],
      config: constructiiBlueprint as EstimateBlueprintConfig,
    });

    const material = lines.find((line) => line.description.includes('Beton placă'));
    const labor = lines.find((line) => line.description.includes('Manoperă cofrare'));
    expect(material).toBeDefined();
    expect(labor).toBeDefined();
    expect(material!.qty).toBe(50);
    expect(labor!.qty).toBe(50);
    expect(material!.lineTotal + labor!.lineTotal).toBe(21000);
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
    expect(result.structuralConcreteM3).toBe(25);
    expect(result.concreteVolumeM3).toBe(25);
    expect(result.rebarKg).toBe(3000);
    expect(result.masonryVolumeM3).toBe(30);
  });

  it('derives foundation concrete by foundation type', () => {
    expect(resolveFoundationConcreteM3('slab', 100)).toBe(18);
    expect(resolveFoundationConcreteM3('pile', 100)).toBe(6);
    expect(resolveFoundationConcreteM3('isolated', 100)).toBe(10);
  });

  it('derives structural concrete as remainder above foundation footprint volume', () => {
    expect(resolveStructuralConcreteM3(200, 14)).toBe(22);
    expect(resolveStructuralConcreteM3(50, 7)).toBe(2);
    expect(resolveStructuralConcreteM3(18, 18)).toBe(0);
  });

  it('always requires manual review while category remains MVP preliminary', () => {
    expect(shouldRequireConstructiiManualReview(60, 1, 'strip')).toBe(true);
    expect(shouldRequireConstructiiManualReview(151, 1, 'strip')).toBe(true);
    expect(shouldRequireConstructiiManualReview(80, 1, 'pile')).toBe(true);

    const small = deriveConstructiiMeasurements(null, { builtArea: 60, storyCount: 1 }, {});
    expect(small.requiresManualReview).toBe(1);
    expect(small.preliminaryEstimate).toBe(1);
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
