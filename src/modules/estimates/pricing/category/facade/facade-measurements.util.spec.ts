import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  deriveFatadeMeasurements,
  resolveFacadeHeightMultiplier,
} from './facade-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { fatadeBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/fatade.blueprint';

describe('facade measurements (fatade)', () => {
  it('computes insulation volume, mesh and dowels from facade area', () => {
    const result = deriveFatadeMeasurements(
      null,
      { facadeArea: 100, insulationThicknessCm: 10, buildingHeightM: 12 },
      {},
    );

    expect(result.scaffoldingArea).toBe(100);
    expect(result.insulationVolumeM3).toBe(10);
    expect(result.meshArea).toBe(110);
    expect(result.dowelQty).toBe(600);
    expect(result.heightMultiplier).toBe(1.2);
    expect(result.facadeAreaLabor).toBe(120);
  });

  it('defaults scaffolding area to facade area', () => {
    const result = deriveFatadeMeasurements(null, { facadeArea: 80 }, {});

    expect(result.scaffoldingArea).toBe(80);
  });

  it('applies height multiplier only above 9m', () => {
    expect(resolveFacadeHeightMultiplier(8)).toBe(1.0);
    expect(resolveFacadeHeightMultiplier(10)).toBe(1.2);
  });

  it('creates scaffolding as a separate pricing line', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveFatadeMeasurements(null, { facadeArea: 120, scaffoldingArea: 130 }, {});

    const lines = engine.buildLinesFromRules(fatadeBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['scaffolding', 'insulation'],
      config: fatadeBlueprint as EstimateBlueprintConfig,
    });

    const scaffoldingLines = lines.filter((line) =>
      line.description.toLowerCase().includes('schel'),
    );
    const insulationLines = lines.filter((line) =>
      line.description.toLowerCase().includes('izola'),
    );

    expect(scaffoldingLines.length).toBeGreaterThan(0);
    expect(scaffoldingLines.some((line) => line.qty === 130)).toBe(true);
    expect(insulationLines.length).toBeGreaterThan(0);
  });
});
