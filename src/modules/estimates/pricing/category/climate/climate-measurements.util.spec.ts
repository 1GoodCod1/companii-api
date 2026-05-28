import {
  CLIMATE_ROUTE_INCLUDED_M,
  deriveClimaMeasurements,
  resolveClimateHeightMultiplier,
} from './climate-measurements.util';

describe('climate measurements (clima)', () => {
  it('splits long route into standard and extra segments', () => {
    const result = deriveClimaMeasurements(
      { rooms: [], points: [{ id: '1', type: 'indoor' }] },
      { acUnits: 1, routeLengthM: 12, heightWork: true },
      {},
    );

    expect(result.routeStandardLengthM).toBe(CLIMATE_ROUTE_INCLUDED_M);
    expect(result.routeExtraLengthM).toBe(7);
    expect(result.freonRechargeQty).toBe(2);
    expect(result.heightMultiplier).toBe(1.25);
    expect(result.routeExtraLengthMLabor).toBe(round2(7 * 1.25));
  });

  it('resolves acUnits from indoor plan points', () => {
    const result = deriveClimaMeasurements(
      {
        rooms: [],
        points: [
          { id: '1', type: 'indoor' },
          { id: '2', type: 'indoor' },
          { id: '3', type: 'outdoor' },
        ],
      },
      { routeLengthM: 6 },
      {},
    );

    expect(result.acUnits).toBe(2);
    expect(result.outdoorUnitCount).toBe(1);
    expect(result.routeExtraLengthM).toBe(1);
  });

  it('derives pump and maintenance counts from booleans', () => {
    const result = deriveClimaMeasurements(
      null,
      { acUnits: 2, routeLengthM: 5, requiresPump: true, maintenancePackage: true },
      {},
    );

    expect(result.pumpCount).toBe(2);
    expect(result.maintenanceCount).toBe(2);
    expect(result.drainLengthM).toBe(5);
    expect(result.coreDrillingQty).toBe(2);
  });

  it('applies height multiplier only when heightWork is enabled', () => {
    expect(resolveClimateHeightMultiplier(true)).toBe(1.25);
    expect(resolveClimateHeightMultiplier(false)).toBe(1.0);
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
