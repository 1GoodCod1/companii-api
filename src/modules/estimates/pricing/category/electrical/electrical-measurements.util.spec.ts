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

    expect(result.cableLengthM).toBe(85); 
    expect(result.materialMultiplier).toBe(1.45);
    expect(result.wallChasingM).toBe(10);
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
    expect(withPanel.panelModules).toBe(12);
    expect(withoutPanel.panelCount).toBe(1);
    expect(withoutPanel.panelModules).toBe(12);
  });

  it('zeros panel modules when no panel is present', () => {
    const result = deriveElektrikaMeasurements(
      { rooms: [], points: [] },
      { roomCount: 2, newPanel: false, panelModules: 12 },
      {},
    );

    expect(result.panelCount).toBe(0);
    expect(result.panelModules).toBe(0);
  });

  it('zeros wall chasing for new construction', () => {
    const result = deriveElektrikaMeasurements(
      { rooms: [], points: [] },
      { roomCount: 3, isNewConstruction: true, wallChasingM: 20 },
      {},
    );

    expect(result.wallChasingM).toBe(0);
    expect(result.wallChasingCostM).toBe(0);
  });

  it('auto-estimates wall chasing when not entered', () => {
    const result = deriveElektrikaMeasurements(
      { rooms: [], points: [] },
      { roomCount: 3 },
      {},
    );

    expect(result.wallChasingM).toBeGreaterThan(0);
    expect(result.cableMaterialM).toBe(result.cableLengthM);
  });

  it('applies cable segment multiplier to cableMaterialM', () => {
    const result = deriveElektrikaMeasurements(
      { rooms: [], points: [] },
      { roomCount: 3, cableSegmentMm2: '6 mm²' },
      {},
    );

    expect(result.cableSegmentMultiplier).toBe(1.7);
    expect(result.cableMaterialM).toBe(Math.round(result.cableLengthM * 1.7 * 100) / 100);
  });

  it('derives per-type point counts for separate pricing lines', () => {
    const result = deriveElektrikaMeasurements(
      { rooms: [], points: [] },
      { roomCount: 2, deviceTier: 'standard', socketCount: 7, switchCount: 6, lightPointCount: 6 },
      {},
    );

    expect(result.deviceTierMultiplier).toBe(1.5);
    expect(result.socketCount).toBe(7);
    expect(result.switchCount).toBe(6);
    expect(result.lightPointCount).toBe(6);
    expect(result.electricPoints).toBe(19);
    expect(result.testingHours).toBe(0);
  });

  it('uses flat testing hours when no electric points are configured', () => {
    const result = deriveElektrikaMeasurements(
      { rooms: [], points: [] },
      { roomCount: 3, socketCount: 0, switchCount: 0, lightPointCount: 0 },
      {},
    );

    expect(result.electricPoints).toBe(0);
    expect(result.testingHours).toBe(2);
  });

  it('treats explicit zero point counts as zero, not auto-estimate', () => {
    const result = deriveElektrikaMeasurements(
      { rooms: [], points: [] },
      { roomCount: 3, socketCount: 0, switchCount: 0, lightPointCount: 0 },
      {},
    );

    expect(result.socketCount).toBe(0);
    expect(result.switchCount).toBe(0);
    expect(result.lightPointCount).toBe(0);
    expect(result.electricPoints).toBe(0);
  });

  it('auto-estimates point counts when fields are absent', () => {
    const result = deriveElektrikaMeasurements(
      { rooms: [], points: [] },
      { roomCount: 3 },
      {},
    );

    expect(result.socketCount).toBe(6);
    expect(result.switchCount).toBe(3);
    expect(result.lightPointCount).toBe(3);
  });

  it('maps wall material multipliers', () => {
    expect(resolveWallMaterialMultiplier('gips')).toBe(1.0);
    expect(resolveWallMaterialMultiplier('bca')).toBe(1.1);
    expect(resolveWallMaterialMultiplier('caramida')).toBe(1.2);
    expect(resolveWallMaterialMultiplier('beton')).toBe(1.45);
  });
});
