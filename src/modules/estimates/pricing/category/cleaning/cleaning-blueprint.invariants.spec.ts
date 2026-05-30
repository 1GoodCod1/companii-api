import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  deriveCleaningMeasurements,
  resolveCleaningTypeMultiplier,
  resolveCombinedCleaningMultiplier,
  resolveDustMultiplier,
} from './cleaning-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { cleaningBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/cleaning.blueprint';
import { findUnusedDerivedMultipliers } from '../../../utils/estimate-blueprint-qty-keys.util';
import { isStageDefaultLaborChargeable } from '../../../services/projects/estimate-stages.service';
import { readCleaningEnabledWorkModules } from '../../../utils/cleaning-work-modules.util';
import {
  CLEANING_PARITY_VECTORS,
  assertNoNaNInMeasurements,
} from './cleaning-parity.vectors';

describe('cleaning blueprint invariants', () => {
  const config = cleaningBlueprint as EstimateBlueprintConfig;
  const defByCode = new Map(config.defaultStages.map((s) => [s.code, s]));
  const engine = new EstimatePricingEngine();

  it('has no unused derived pricing multipliers', () => {
    const unused = findUnusedDerivedMultipliers(config, ['totalCleaningMultiplier']);

    expect(unused).toEqual([]);
  });

  it('matches shared frontend parity vectors', () => {
    for (const scenario of CLEANING_PARITY_VECTORS) {
      const result = deriveCleaningMeasurements(null, scenario.diagnostic, {});
      for (const [key, value] of Object.entries(scenario.expected)) {
        expect(result[key]).toBe(value);
      }
      assertNoNaNInMeasurements(result as Record<string, number>);
    }
  });

  it('default estimate has no phantom stage-default labor on empty add-ons', () => {
    const diagnostic = { cleanArea: 40, cleaningType: 'standard' };
    const measurements = deriveCleaningMeasurements(null, diagnostic, {});
    const enabled = readCleaningEnabledWorkModules(diagnostic, config);

    for (const code of ['bucatarie_bai', 'geamuri', 'special']) {
      expect(
        isStageDefaultLaborChargeable(defByCode.get(code), enabled, config, measurements),
      ).toBe(false);
    }
  });

  it('post_construction type produces lines without separate module toggle', () => {
    const diagnostic = { cleanArea: 60, cleaningType: 'post_construction' };
    const measurements = deriveCleaningMeasurements(null, diagnostic, {});
    const enabled = readCleaningEnabledWorkModules(diagnostic, config);

    const lines = engine.buildLinesFromRules(cleaningBlueprint.pricingRules, measurements, {
      enabledWorkModules: enabled,
      config,
    });

    expect(lines.some((line) => line.description.toLowerCase().includes('post-șantier'))).toBe(true);
    expect(lines.some((line) => line.description.toLowerCase().includes('standard'))).toBe(false);
    expect(measurements.standardCleanAreaLabor).toBe(0);
    expect(measurements.postConstructionAreaLabor).toBe(60);
  });

  it('deep type does not double-charge with standard area labor', () => {
    const diagnostic = { cleanArea: 40, cleaningType: 'deep' };
    const measurements = deriveCleaningMeasurements(null, diagnostic, {});
    const enabled = readCleaningEnabledWorkModules(diagnostic, config);

    const lines = engine.buildLinesFromRules(cleaningBlueprint.pricingRules, measurements, {
      enabledWorkModules: enabled,
      config,
    });

    expect(measurements.standardCleanAreaLabor).toBe(0);
    expect(measurements.deepCleanAreaLabor).toBe(40);
    expect(lines.some((line) => line.description.toLowerCase().includes('standard'))).toBe(false);
    expect(lines.some((line) => line.description.toLowerCase().includes('profundă'))).toBe(true);
  });

  it('area labor lines use real m² in qty (multiplier in unitPrice path)', () => {
    const diagnostic = { cleanArea: 40, cleaningType: 'deep', furniturePresent: true };
    const measurements = deriveCleaningMeasurements(null, diagnostic, {});
    const enabled = readCleaningEnabledWorkModules(diagnostic, config);

    const lines = engine.buildLinesFromRules(cleaningBlueprint.pricingRules, measurements, {
      enabledWorkModules: enabled,
      config,
    });

    const deepLine = lines.find((line) => line.description.toLowerCase().includes('profundă'));
    expect(deepLine?.qty).toBe(40);
    expect(deepLine?.unitPrice).toBeGreaterThan(42);
  });
});

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
    expect(result.deepCleanAreaLabor).toBe(120);
    expect(result.standardCleanAreaLabor).toBe(0);
  });

  it('separates post_construction from standard clean area labor', () => {
    const standard = deriveCleaningMeasurements(null, { cleanArea: 80, cleaningType: 'standard' }, {});
    const postConstruction = deriveCleaningMeasurements(
      null,
      { cleanArea: 80, cleaningType: 'post_construction', afterRepairDustLevel: 'high' },
      {},
    );

    expect(standard.standardCleanAreaLabor).toBe(80);
    expect(standard.postConstructionAreaLabor).toBe(0);
    expect(postConstruction.postConstructionAreaLabor).toBe(80);
    expect(postConstruction.standardCleanAreaLabor).toBe(0);
  });

  it('maps cleaning type and dust multipliers', () => {
    expect(resolveCleaningTypeMultiplier('standard')).toBe(1.0);
    expect(resolveCleaningTypeMultiplier('post_construction')).toBe(1.65);
    expect(resolveDustMultiplier('high')).toBe(1.35);
    expect(resolveCombinedCleaningMultiplier('standard', 'low', false)).toBe(1.0);
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
