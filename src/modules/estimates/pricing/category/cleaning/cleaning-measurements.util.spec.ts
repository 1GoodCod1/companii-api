import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  deriveCleaningMeasurements,
  resolveCleaningTypeMultiplier,
  resolveCombinedCleaningMultiplier,
  resolveDustMultiplier,
} from './cleaning-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { cleaningBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/cleaning.blueprint';

describe('cleaning measurements (cleaning)', () => {
  it('computes chemistry and trash units from clean area', () => {
    const result = deriveCleaningMeasurements(
      null,
      { cleanArea: 120, trashRemoval: true, cleaningType: 'deep', afterRepairDustLevel: 'medium' },
      {},
    );

    expect(result.chemistryUnits).toBe(3);
    expect(result.trashRemovalUnits).toBe(3);
    expect(result.totalCleaningMultiplier).toBe(round2(1.35 * 1.15));
    expect(result.cleanAreaLabor).toBe(round2(120 * result.totalCleaningMultiplier));
  });

  it('separates post_construction from standard clean area labor', () => {
    const standard = deriveCleaningMeasurements(null, { cleanArea: 80, cleaningType: 'standard' }, {});
    const postConstruction = deriveCleaningMeasurements(
      null,
      { cleanArea: 80, cleaningType: 'post_construction', afterRepairDustLevel: 'high' },
      {},
    );

    expect(standard.standardCleanAreaLabor).toBeGreaterThan(0);
    expect(standard.postConstructionAreaLabor).toBe(0);
    expect(postConstruction.postConstructionAreaLabor).toBeGreaterThan(standard.standardCleanAreaLabor);
    expect(postConstruction.standardCleanAreaLabor).toBe(0);
  });

  it('maps cleaning type and dust multipliers', () => {
    expect(resolveCleaningTypeMultiplier('standard')).toBe(1.0);
    expect(resolveCleaningTypeMultiplier('post_construction')).toBe(1.65);
    expect(resolveDustMultiplier('high')).toBe(1.35);
    expect(resolveCombinedCleaningMultiplier('standard', 'low', false)).toBe(1.0);
  });

  it('uses separate modules for post_construction vs standard lines', () => {
    const engine = new EstimatePricingEngine();
    const standardMeasurements = deriveCleaningMeasurements(
      null,
      { cleanArea: 60, cleaningType: 'standard' },
      {},
    );
    const postMeasurements = deriveCleaningMeasurements(
      null,
      { cleanArea: 60, cleaningType: 'post_construction' },
      {},
    );

    const standardLines = engine.buildLinesFromRules(cleaningBlueprint.pricingRules, standardMeasurements, {
      enabledWorkModules: ['standard_cleaning'],
      config: cleaningBlueprint as EstimateBlueprintConfig,
    });
    const postLines = engine.buildLinesFromRules(cleaningBlueprint.pricingRules, postMeasurements, {
      enabledWorkModules: ['post_construction'],
      config: cleaningBlueprint as EstimateBlueprintConfig,
    });

    expect(standardLines.some((line) => line.description.toLowerCase().includes('standard'))).toBe(true);
    expect(standardLines.some((line) => line.description.toLowerCase().includes('post-șantier'))).toBe(false);
    expect(postLines.some((line) => line.description.toLowerCase().includes('post-șantier'))).toBe(true);
    expect(postLines.some((line) => line.description.toLowerCase().includes('standard'))).toBe(false);
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
