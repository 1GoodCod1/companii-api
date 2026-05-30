import { deriveConstructiiMeasurements } from './constructii-measurements.util';
import { constructiiBlueprint } from '../../../../../../prisma/estimate-blueprints/categories/constructii.blueprint';
import { findUnusedDerivedMultipliers } from '../../../utils/estimate-blueprint-qty-keys.util';
import {
  CONSTRUCTII_PARITY_VECTORS,
  assertNoNaNInMeasurements,
} from './constructii-parity.vectors';

describe('constructii blueprint invariants', () => {
  it('has no unused derived pricing multipliers', () => {
    const unused = findUnusedDerivedMultipliers(constructiiBlueprint, [
      'foundationMultiplier',
      'wallMaterialMultiplier',
      'slabTypeMultiplier',
    ]);

    expect(unused).toEqual([]);
  });

  it('matches shared frontend parity vectors', () => {
    for (const scenario of CONSTRUCTII_PARITY_VECTORS) {
      const result = deriveConstructiiMeasurements(null, scenario.diagnostic, {});
      for (const [key, value] of Object.entries(scenario.expected)) {
        expect(result[key]).toBe(value);
      }
      assertNoNaNInMeasurements(result as Record<string, number>);
    }
  });
});
