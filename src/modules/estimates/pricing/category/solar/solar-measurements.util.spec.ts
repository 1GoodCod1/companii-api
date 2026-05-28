import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  derivePanouriSolareMeasurements,
  resolveRoofMultiplier,
  shouldRequireSolarManualReview,
} from './solar-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { panouriSolareBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/panouri-solare.blueprint';

describe('Solar measurements (panouri-solare)', () => {
  it('defaults inverterCount to 1 and does not derive it from panelCount', () => {
    const result = derivePanouriSolareMeasurements(
      null,
      { panelCount: 12, batteryCapacity: 10 },
      {},
    );

    expect(result.inverterCount).toBe(1);
    expect(result.inverterCount).not.toBe(result.panelCount);
  });

  it('respects explicit inverterCount from diagnostic', () => {
    const result = derivePanouriSolareMeasurements(
      null,
      { panelCount: 20, inverterCount: 2, batteryCapacity: 15 },
      {},
    );

    expect(result.inverterCount).toBe(2);
    expect(result.inverterCount).not.toBe(result.panelCount);
  });

  it('applies roofMultiplier to structure and panel labor qty', () => {
    const tile = derivePanouriSolareMeasurements(
      null,
      { panelCount: 10, batteryCapacity: 5, roofType: 'tile' },
      {},
    );
    const metal = derivePanouriSolareMeasurements(
      null,
      { panelCount: 10, batteryCapacity: 5, roofType: 'metal' },
      {},
    );

    expect(resolveRoofMultiplier('tile')).toBe(1.15);
    expect(tile.structureLaborQty).toBe(11.5);
    expect(tile.panelLaborQty).toBe(11.5);
    expect(metal.structureLaborQty).toBe(10);
    expect(tile.structureQty).toBe(10);
  });

  it('derives cableLengthM and systemPowerKw from formulas', () => {
    const result = derivePanouriSolareMeasurements(
      null,
      { panelCount: 8, batteryCapacity: 10, panelWp: 450 },
      {},
    );

    expect(result.cableLengthM).toBe(20);
    expect(result.systemPowerKw).toBe(3.6);
    expect(result.permitUnits).toBe(0);
    expect(result.monitoringUnits).toBe(0);
  });

  it('flags large systems for manual review', () => {
    expect(shouldRequireSolarManualReview(31, 10)).toBe(true);
    expect(shouldRequireSolarManualReview(10, 16)).toBe(true);

    const result = derivePanouriSolareMeasurements(
      null,
      { panelCount: 32, batteryCapacity: 20, systemPowerKw: 12.8 },
      {},
    );
    expect(result.requiresManualReview).toBe(1);
  });

  it('prices inverter labor by inverterCount, not panelCount', () => {
    const engine = new EstimatePricingEngine();
    const measurements = derivePanouriSolareMeasurements(
      null,
      { panelCount: 16, inverterCount: 2, batteryCapacity: 10 },
      {},
    );

    const lines = engine.buildLinesFromRules(panouriSolareBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['inverter'],
      config: panouriSolareBlueprint as EstimateBlueprintConfig,
    });

    const inverterLine = lines.find((line) => line.description.toLowerCase().includes('invertor'));
    expect(inverterLine?.qty).toBe(2);
    expect(inverterLine?.qty).not.toBe(measurements.panelCount);
  });
});
