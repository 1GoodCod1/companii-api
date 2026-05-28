import { EstimatePricingEngine } from '../../pricing-engine.service';
import {
  deriveOknaDveriMeasurements,
  resolveInstallationMultiplier,
} from './windows-doors-measurements.util';
import type { EstimateBlueprintConfig } from '../../../../../../prisma/estimate-blueprint-config.types';
import { oknaDveriBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/okna-dveri.blueprint';

describe('windows/doors measurements (okna-dveri)', () => {
  it('derives counts from plan points and applies installation multiplier', () => {
    const result = deriveOknaDveriMeasurements(
      {
        rooms: [],
        points: [
          { id: '1', type: 'window' },
          { id: '2', type: 'window' },
          { id: '3', type: 'door' },
        ],
      },
      { installationType: 'warm_installation', sillCount: 2 },
      {},
    );

    expect(result.windowCount).toBe(2);
    expect(result.doorCount).toBe(1);
    expect(result.installationMultiplier).toBe(1.35);
    expect(result.windowCountLabor).toBe(round2(2 * 1.35));
    expect(result.doorCountLabor).toBe(round2(1 * 1.35));
    expect(result.foamTubes).toBe(Math.ceil(3 * 0.7));
    expect(result.sillLengthM).toBe(2.4);
    expect(result.warmInstallationUnits).toBe(3);
  });

  it('maps installation multipliers', () => {
    expect(resolveInstallationMultiplier('standard')).toBe(1.0);
    expect(resolveInstallationMultiplier('warm_installation')).toBe(1.35);
    expect(resolveInstallationMultiplier('renovation')).toBe(1.2);
  });

  it('computes old removal qty when enabled', () => {
    const result = deriveOknaDveriMeasurements(
      null,
      { windowCount: 4, doorCount: 1, oldFrameRemoval: true },
      {},
    );

    expect(result.oldRemovalQty).toBe(5);
    expect(result.disposalQty).toBe(5);
  });

  it('applies warm installation multiplier to labor lines', () => {
    const engine = new EstimatePricingEngine();
    const measurements = deriveOknaDveriMeasurements(
      null,
      { windowCount: 2, doorCount: 0, installationType: 'renovation' },
      {},
    );

    const lines = engine.buildLinesFromRules(oknaDveriBlueprint.pricingRules, measurements, {
      enabledWorkModules: ['windows'],
      config: oknaDveriBlueprint as EstimateBlueprintConfig,
    });

    const windowLabor = lines.find((line) => line.description.includes('fereastr'));
    expect(windowLabor?.qty).toBe(2.4);
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
