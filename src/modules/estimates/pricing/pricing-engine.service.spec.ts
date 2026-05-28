import type { EstimateBlueprintConfig } from '../../../../prisma/estimate-blueprint-config.types';
import {
  acoperisBlueprint,
  elektrikaBlueprint,
  fatadeBlueprint,
  itNetworksBlueprint,
  santehnikaBlueprint,
} from '../../../../prisma/estimate-blueprints/registry';
import { readEnabledWorkModules } from '../utils/work-modules.util';
import { EstimatePricingEngine } from './pricing-engine.service';
import type { Plan2dData } from './plan2d.types';

describe('EstimatePricingEngine integration (E-06)', () => {
  const engine = new EstimatePricingEngine();

  function buildLines(
    slug: keyof typeof BLUEPRINTS,
    measurements: Record<string, number>,
    diagnostic: Record<string, unknown>,
  ) {
    const config = BLUEPRINTS[slug];
    return engine.buildLinesFromRules(config.pricingRules, measurements, {
      enabledWorkModules: readEnabledWorkModules(diagnostic, config),
      config: config as EstimateBlueprintConfig,
    });
  }

  it('santehnika: derives pipe lengths and emits water pipe labor lines', () => {
    const diagnostic = {
      bathroomCount: 2,
      kitchenPoints: 1,
      replacePipes: true,
      accessDifficulty: 'mediu',
      enabledWorkModules: ['water_pipes', 'drain', 'sanitary_objects', 'testing'],
    };
    const plan2d: Plan2dData = {
      rooms: [
        { id: '1', name: 'Baie', width: 4, height: 3 },
        { id: '2', name: 'Baie 2', width: 3, height: 3 },
        { id: '3', name: 'Bucătărie', width: 4, height: 4 },
      ],
      points: [],
    };

    const measurements = engine.deriveMeasurements(plan2d, diagnostic, 'santehnika');

    expect(measurements.pipeLengthM).toBe(33);
    expect(measurements.drainLengthM).toBe(8);
    expect(measurements.pipeLengthMLabor).toBe(round2(33 * 1.15));

    const lines = buildLines('santehnika', measurements, diagnostic);
    const descriptions = lines.map((line) => line.description.toLowerCase());

    expect(lines.length).toBeGreaterThan(0);
    expect(descriptions.some((d) => d.includes('apă') || d.includes('apa'))).toBe(true);
    expect(lines.every((line) => line.qty > 0)).toBe(true);
  });

  it('elektrika: derives cable length and emits cabling lines without low-voltage module', () => {
    const diagnostic = {
      roomCount: 3,
      cableReplace: true,
      dedicatedLinesCount: 2,
      wallMaterial: 'beton',
      wallChasingM: 10,
      enabledWorkModules: ['cabling', 'chasing', 'devices', 'testing'],
    };

    const measurements = engine.deriveMeasurements(
      { rooms: [{ id: '1', name: 'Living', width: 4, height: 5 }], points: [] },
      diagnostic,
      'elektrika',
    );

    expect(measurements.cableLengthM).toBe(85);
    expect(measurements.cableLengthMLabor).toBe(round2(85 * 1.45));

    const lines = buildLines('elektrika', measurements, diagnostic);
    const descriptions = lines.map((line) => line.description.toLowerCase());

    expect(descriptions.some((d) => d.includes('cablu') || d.includes('cabl'))).toBe(true);
    expect(descriptions.some((d) => d.includes('slab') || d.includes('tensiune'))).toBe(false);
  });

  it('acoperis: derives roof area from slope and emits covering lines', () => {
    const diagnostic = {
      baseArea: 100,
      roofSlope: 30,
      roofShape: 'rectangle',
      enabledWorkModules: ['timber_structure', 'membrane', 'covering'],
    };

    const measurements = engine.deriveMeasurements(null, diagnostic, 'acoperis');

    expect(measurements.roofArea).toBeGreaterThan(100);
    expect(measurements.roofAreaLabor).toBeGreaterThan(0);
    expect(measurements.timberVolumeM3).toBeGreaterThan(0);

    const lines = buildLines('acoperis', measurements, diagnostic);
    const descriptions = lines.map((line) => line.description.toLowerCase());

    expect(descriptions.some((d) => d.includes('căprior') || d.includes('caprior'))).toBe(true);
    expect(descriptions.some((d) => d.includes('învelitoare') || d.includes('invelitoare'))).toBe(
      true,
    );
  });

  it('fatade: derives insulation quantities and emits scaffolding and insulation lines', () => {
    const diagnostic = {
      facadeArea: 100,
      insulationThicknessCm: 10,
      buildingHeightM: 12,
      enabledWorkModules: ['scaffolding', 'insulation'],
    };

    const measurements = engine.deriveMeasurements(null, diagnostic, 'fatade');

    expect(measurements.insulationVolumeM3).toBe(10);
    expect(measurements.scaffoldingArea).toBe(100);
    expect(measurements.facadeAreaLabor).toBe(120);

    const lines = buildLines('fatade', measurements, diagnostic);
    const descriptions = lines.map((line) => line.description.toLowerCase());

    expect(descriptions.some((d) => d.includes('schel'))).toBe(true);
    expect(descriptions.some((d) => d.includes('izola'))).toBe(true);
  });

  it('it-networks: derives network cable length and emits cabling lines only for network module', () => {
    const diagnostic = {
      networkPoints: 12,
      pagesCount: 10,
      hasBackend: true,
      projectScope: 'Mediu (6-20 pagini / 1-2 săptămâni)',
      enabledWorkModules: ['network_cabling'],
    };

    const measurements = engine.deriveMeasurements(null, diagnostic, 'it-networks');

    expect(measurements.networkCableM).toBe(240);
    expect(measurements.networkPoints).toBe(12);

    const lines = buildLines('it-networks', measurements, diagnostic);
    const descriptions = lines.map((line) => line.description.toLowerCase());

    expect(descriptions.some((d) => d.includes('cablare') || d.includes('cablu'))).toBe(true);
    expect(descriptions.some((d) => d.includes('frontend') || d.includes('backend'))).toBe(false);
  });
});

const BLUEPRINTS = {
  santehnika: santehnikaBlueprint,
  elektrika: elektrikaBlueprint,
  acoperis: acoperisBlueprint,
  fatade: fatadeBlueprint,
  'it-networks': itNetworksBlueprint,
} as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
