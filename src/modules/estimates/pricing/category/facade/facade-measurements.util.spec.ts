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

  it('defaults scaffolding area to facade area when not none', () => {
    const result = deriveFatadeMeasurements(null, { facadeArea: 80, scaffoldingType: 'inchiriata' }, {});
    expect(result.scaffoldingArea).toBe(80);
  });

  it('calculates scaffoldingAssemblyArea and scaffoldingDisassemblyArea for own scaffolding, but 0 rental area', () => {
    const result = deriveFatadeMeasurements(
      null,
      { facadeArea: 100, scaffoldingType: 'proprie', scaffoldingArea: 120 },
      {},
    );
    expect(result.scaffoldingArea).toBe(120);
    expect(result.scaffoldingAssemblyArea).toBe(120);
    expect(result.scaffoldingDisassemblyArea).toBe(120);
    expect(result.scaffoldingRentalArea).toBe(0);
  });

  it('calculates scaffoldingRentalArea correctly for rented scaffolding with various periods', () => {
    // 10 days = 10 / 30 months = 0.33 months
    const resultDays = deriveFatadeMeasurements(
      null,
      { facadeArea: 100, scaffoldingType: 'inchiriata', scaffoldingRentalPeriod: 'days', scaffoldingRentalDuration: 10 },
      {},
    );
    expect(resultDays.scaffoldingRentalArea).toBeCloseTo(33.33, 2);

    // 2 weeks = 14 / 30 months = 0.47 months
    const resultWeeks = deriveFatadeMeasurements(
      null,
      { facadeArea: 100, scaffoldingType: 'inchiriata', scaffoldingRentalPeriod: 'weeks', scaffoldingRentalDuration: 2 },
      {},
    );
    expect(resultWeeks.scaffoldingRentalArea).toBeCloseTo(46.67, 2);

    // 2 months = 2.0 months
    const resultMonths = deriveFatadeMeasurements(
      null,
      { facadeArea: 100, scaffoldingType: 'inchiriata', scaffoldingRentalPeriod: 'months', scaffoldingRentalDuration: 2 },
      {},
    );
    expect(resultMonths.scaffoldingRentalArea).toBe(200);
  });

  it('sets all scaffolding areas to 0 for fara schela', () => {
    const result = deriveFatadeMeasurements(
      null,
      { facadeArea: 100, scaffoldingType: 'fara' },
      {},
    );
    expect(result.scaffoldingArea).toBe(0);
    expect(result.scaffoldingAssemblyArea).toBe(0);
    expect(result.scaffoldingDisassemblyArea).toBe(0);
    expect(result.scaffoldingRentalArea).toBe(0);
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

  it('applies facadeCondition multiplier correctly to labor fields', () => {
    // old = 1.15 multiplier
    const resultOld = deriveFatadeMeasurements(
      null,
      { facadeArea: 100, facadeCondition: 'old' },
      {},
    );
    expect(resultOld.conditionMultiplier).toBe(1.15);
    expect(resultOld.facadeAreaLabor).toBe(115);
    expect(resultOld.meshAreaLabor).toBe(126.5); // meshArea = 110 * 1.15 = 126.5

    // damaged = 1.30 multiplier
    const resultDamaged = deriveFatadeMeasurements(
      null,
      { facadeArea: 100, facadeCondition: 'damaged' },
      {},
    );
    expect(resultDamaged.conditionMultiplier).toBe(1.30);
    expect(resultDamaged.facadeAreaLabor).toBe(130);
    expect(resultDamaged.meshAreaLabor).toBe(143); // meshArea = 110 * 1.30 = 143
  });

  it('includes scaffolding duration details in the line description', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveFatadeMeasurements(
      null,
      { facadeArea: 100, scaffoldingType: 'inchiriata', scaffoldingRentalPeriod: 'months', scaffoldingRentalDuration: 3 },
      {},
    );

    const lines = engine.buildLinesFromRules(fatadeBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['scaffolding'],
      config: fatadeBlueprint as EstimateBlueprintConfig,
      diagnostic: { scaffoldingType: 'inchiriata', scaffoldingRentalPeriod: 'months', scaffoldingRentalDuration: 3 },
    });

    const rentalLine = lines.find((line) => line.description.includes('Închiriere schelă'));
    expect(rentalLine).toBeDefined();
    expect(rentalLine?.description).toBe('Închiriere schelă (100 m² × 3 luni)');
  });
});
