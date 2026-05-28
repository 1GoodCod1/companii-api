import { deriveSantehnikaMeasurements, resolvePlumbingAccessMultiplier } from './plumbing-measurements.util';

describe('plumbing measurements (santehnika)', () => {
  it('computes pipe, drain and fittings from bathroom/kitchen inputs', () => {
    const result = deriveSantehnikaMeasurements(
      { rooms: [{ id: '1', name: 'Baie', width: 4, height: 3 }], points: [] },
      {
        bathroomCount: 2,
        kitchenPoints: 1,
        replacePipes: true,
        accessDifficulty: 'mediu',
      },
      { roomCount: 3 },
    );

    expect(result.pipeLengthM).toBe(33);
    expect(result.drainLengthM).toBe(8);
    expect(result.fittingsQty).toBe(Math.ceil(33 * 0.8));
    expect(result.plumbingPoints).toBeGreaterThan(0);
    expect(result.complexityMultiplier).toBe(1.15);
    // Slice 2: access multiplier is applied centrally via blueprint.accessDifficultyImpact
    // at unitPrice level. The Labor qty fields remain equal to base qty.
    expect(result.pipeLengthMLabor).toBe(33);
  });

  it('uses plan points when available', () => {
    const result = deriveSantehnikaMeasurements(
      {
        rooms: [],
        points: [
          { id: '1', type: 'water' },
          { id: '2', type: 'drain' },
          { id: '3', type: 'mixer' },
        ],
      },
      { bathroomCount: 1 },
      {},
    );

    expect(result.plumbingPoints).toBe(3);
  });

  it('sets waterHeaterCount from boolean custom field', () => {
    const withBoiler = deriveSantehnikaMeasurements(null, { bathroomCount: 1, waterHeater: true }, {});
    const withoutBoiler = deriveSantehnikaMeasurements(null, { bathroomCount: 1, waterHeater: false }, {});

    expect(withBoiler.waterHeaterCount).toBe(1);
    expect(withoutBoiler.waterHeaterCount).toBe(0);
  });

  it('maps access difficulty aliases', () => {
    expect(resolvePlumbingAccessMultiplier('ușor')).toBe(1.0);
    expect(resolvePlumbingAccessMultiplier('dificil')).toBe(1.35);
    expect(resolvePlumbingAccessMultiplier('difficult')).toBe(1.35);
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
