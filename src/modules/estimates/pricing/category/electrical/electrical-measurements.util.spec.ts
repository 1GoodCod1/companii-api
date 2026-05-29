import {
  deriveElektrikaMeasurements,
  resolveWallMaterialMultiplier,
} from './electrical-measurements.util';

describe('electrical measurements (elektrika)', () => {
  it('computes cable length with room count, replacement and dedicated lines', () => {
    const result = deriveElektrikaMeasurements(
      { rooms: [{ id: '1', name: 'Living', width: 4, height: 5 }], points: [] },
      {
        roomCount: 3,
        cableReplace: true,
        dedicatedLinesCount: 2,
        wallMaterial: 'beton',
        wallChasingM: 10,
      },
      {},
    );

    expect(result.cableLengthM).toBe(85); // max(15, 36) + 25 + 24
    expect(result.materialMultiplier).toBe(1.45);
    expect(result.wallChasingCostM).toBe(14.5);
    expect(result.cableLengthMLabor).toBe(85);
    expect(result.electricPoints).toBeGreaterThan(0);
  });

  it('derives electric points from plan when manual counts are absent', () => {
    const result = deriveElektrikaMeasurements(
      {
        rooms: [],
        points: [
          { id: '1', type: 'socket' },
          { id: '2', type: 'socket' },
          { id: '3', type: 'switch' },
          { id: '4', type: 'light' },
        ],
      },
      { roomCount: 2 },
      {},
    );

    expect(result.socketCount).toBe(2);
    expect(result.switchCount).toBe(1);
    expect(result.lightPointCount).toBe(1);
    expect(result.electricPoints).toBe(4);
  });

  it('adds panel count when newPanel is enabled', () => {
    const withPanel = deriveElektrikaMeasurements(
      { rooms: [], points: [{ id: '1', type: 'panel' }] },
      { roomCount: 1, newPanel: true },
      {},
    );
    const withoutPanel = deriveElektrikaMeasurements(
      { rooms: [], points: [{ id: '1', type: 'panel' }] },
      { roomCount: 1, newPanel: false },
      {},
    );

    expect(withPanel.panelCount).toBe(2);
    expect(withoutPanel.panelCount).toBe(1);
  });

  it('maps wall material multipliers', () => {
    expect(resolveWallMaterialMultiplier('gips')).toBe(1.0);
    expect(resolveWallMaterialMultiplier('bca')).toBe(1.1);
    expect(resolveWallMaterialMultiplier('caramida')).toBe(1.2);
    expect(resolveWallMaterialMultiplier('beton')).toBe(1.45);
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
