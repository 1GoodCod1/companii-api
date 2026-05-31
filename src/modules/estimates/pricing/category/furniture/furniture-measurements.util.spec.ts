import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  deriveMobilaMeasurements,
  resolveHardwareCostMultiplier,
} from './furniture-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { mobilaBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/mobila.blueprint';

describe('furniture measurements (mobila)', () => {
  it('derives counts from plan points and linear meters fallback', () => {
    const result = deriveMobilaMeasurements(
      {
        rooms: [],
        points: [
          { id: '1', type: 'kitchen_cabinet' },
          { id: '2', type: 'kitchen_cabinet' },
          { id: '3', type: 'wardrobe' },
        ],
      },
      { hardwareTier: 'premium', deliveryRequired: true, installationRequired: true },
      {},
    );

    expect(result.cabinetCount).toBe(2);
    expect(result.wardrobeCount).toBe(1);
    expect(result.linearMeters).toBe(round2(2 * 0.8 + 1 * 1.5));
    expect(result.hardwareCostMultiplier).toBe(1.7);
    expect(result.deliveryQty).toBe(1);
    expect(result.installationQty).toBe(3);
  });

  it('prefers manual linear meters over derived estimate', () => {
    const result = deriveMobilaMeasurements(null, { cabinetCount: 5, linearMeters: 12 }, {});

    expect(result.cuttingLinearM).toBe(12);
  });

  it('maps hardware tier multipliers', () => {
    expect(resolveHardwareCostMultiplier('basic')).toBe(1.0);
    expect(resolveHardwareCostMultiplier('standard')).toBe(1.25);
    expect(resolveHardwareCostMultiplier('premium')).toBe(1.7);
  });

  it('prices material, soft-close, cutouts and assembly complexity inputs', () => {
    const result = deriveMobilaMeasurements(
      null,
      {
        cabinetCount: 4,
        wardrobeCount: 1,
        materialType: 'pal',
        frontMaterialType: 'mdf',
        materialThickness: '18 mm',
        finishType: 'Lucios',
        hardwareTier: 'standard',
        softClose: true,
        hasApplianceCutouts: true,
        assemblyComplexity: 'Mediu (sertare multiple)',
      },
      {},
    );

    expect(result.materialMultiplier).toBe(round2(1.3 * 1.05 * 1.1));
    expect(result.cuttingMaterialPremiumM).toBeGreaterThan(0);
    expect(result.hardwareCostMultiplier).toBe(round2(1.25 * 1.1));
    expect(result.applianceCutoutUnits).toBe(2);
    expect(result.assemblyCabinetQty).toBe(round2(4 * 1.2));
    expect(result.assemblyWardrobeQty).toBe(round2(1 * 1.2));
  });

  it('creates delivery and installation as separate qty lines', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveMobilaMeasurements(
      null,
      {
        cabinetCount: 3,
        wardrobeCount: 1,
        deliveryRequired: true,
        installationRequired: true,
        hardwareTier: 'standard',
      },
      {},
    );

    const lines = engine.buildLinesFromRules(mobilaBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['delivery', 'installation', 'hardware'],
      config: mobilaBlueprint as EstimateBlueprintConfig,
    });

    expect(lines.some((line) => line.description.toLowerCase().includes('livrare') && line.qty === 1)).toBe(
      true,
    );
    expect(lines.some((line) => line.description.toLowerCase().includes('montaj la client') && line.qty === 4)).toBe(
      true,
    );
    expect(lines.some((line) => line.description.toLowerCase().includes('feronerie'))).toBe(true);
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
