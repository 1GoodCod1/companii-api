import { deriveElektrikaMeasurements } from './electrical-measurements.util';
import { elektrikaBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/elektrika.blueprint';
import { findUnusedDerivedMultipliers } from '../../../utils/estimate-blueprint-qty-keys.util';
import type { Plan2dData } from '../../plan2d.types';

const planFixture: Plan2dData = {
  rooms: [],
  points: [
    { id: '1', type: 'socket' },
    { id: '2', type: 'socket' },
    { id: '3', type: 'switch' },
    { id: '4', type: 'light' },
  ],
};

describe('elektrika blueprint invariants', () => {
  it('has no unused derived pricing multipliers', () => {
    const unused = findUnusedDerivedMultipliers(
      elektrikaBlueprint,
      ['cableSegmentMultiplier', 'deviceTierMultiplier', 'materialMultiplier'],
      [{ multiplierKey: 'cableSegmentMultiplier', viaQtyKey: 'cableMaterialM' }],
    );

    expect(unused).toEqual([]);
  });

  it('matches frontend parity vectors for shared scenarios', () => {
    const scenarios: Array<{
      label: string;
      diagnostic: Record<string, unknown>;
      plan2d?: Plan2dData | null;
      expected: Partial<Record<string, number>>;
    }> = [
      {
        label: 'new construction',
        diagnostic: { roomCount: 3, isNewConstruction: true },
        expected: { wallChasingM: 0, wallChasingCostM: 0, panelModules: 0, panelCount: 0 },
      },
      {
        label: 'plan points',
        diagnostic: { roomCount: 2 },
        plan2d: planFixture,
        expected: { socketCount: 2, switchCount: 1, lightPointCount: 1, electricPoints: 4 },
      },
      {
        label: '6mm cable segment',
        diagnostic: { roomCount: 3, cableSegmentMm2: '6 mm²' },
        expected: { cableSegmentMultiplier: 1.7 },
      },
      {
        label: 'no panel',
        diagnostic: { roomCount: 2, newPanel: false, panelModules: 12 },
        expected: { panelCount: 0, panelModules: 0 },
      },
    ];

    for (const scenario of scenarios) {
      const result = deriveElektrikaMeasurements(scenario.plan2d ?? null, scenario.diagnostic, {});
      for (const [key, value] of Object.entries(scenario.expected)) {
        expect(result[key]).toBe(value);
      }
    }
  });
});
