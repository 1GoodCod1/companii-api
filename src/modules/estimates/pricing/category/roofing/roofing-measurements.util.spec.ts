import {
  computeRoofAreaFromSlope,
  deriveAcoperisMeasurements,
  deriveValleyLengthFromShape,
  resolveRoofShapeMultiplier,
  shouldRequireRoofManualReview,
} from './roofing-measurements.util';

describe('roofing measurements (acoperis)', () => {
  it('computes roof area using cos(radians) with wastage factor', () => {
    const baseArea = 100;
    const slope = 30;
    const expected = Math.round((baseArea / Math.cos((slope * Math.PI) / 180)) * 1.12 * 100) / 100;

    expect(computeRoofAreaFromSlope(baseArea, slope)).toBe(expected);
  });

  it('guards steep slopes near upper limit (70°+)', () => {
    expect(computeRoofAreaFromSlope(100, 74)).toBe(115);
    expect(computeRoofAreaFromSlope(100, 75)).toBe(115);
  });

  it('derives complexity, valleys and manual review flags', () => {
    const result = deriveAcoperisMeasurements(
      { rooms: [{ id: '1', name: 'Corp', width: 10, height: 10, shapeType: 'l-shape' }], points: [] },
      { baseArea: 80, roofSlope: 65, roofShape: 'complex', oldRoofRemoval: true, insulationRequired: true },
      {},
    );

    expect(result.roofAreaLabor).toBe(round2(result.roofArea * 1.5));
    expect(result.valleyLengthM).toBe(24);
    expect(result.oldRoofRemovalArea).toBe(result.roofArea);
    expect(result.insulationArea).toBe(result.roofArea);
    expect(result.requiresManualReview).toBe(1);
  });

  it('maps roof shape multipliers', () => {
    expect(resolveRoofShapeMultiplier('rectangle')).toBe(1.0);
    expect(resolveRoofShapeMultiplier('l-shape')).toBe(1.2);
    expect(resolveRoofShapeMultiplier('t-shape')).toBe(1.35);
    expect(resolveRoofShapeMultiplier('complex')).toBe(1.5);
  });

  it('derives valley length from shape when manual value is absent', () => {
    expect(deriveValleyLengthFromShape('rectangle')).toBe(0);
    expect(deriveValleyLengthFromShape('l-shape')).toBe(12);
    expect(deriveValleyLengthFromShape('complex', 30)).toBe(30);
  });

  it('flags manual review for high slope or complex shape', () => {
    expect(shouldRequireRoofManualReview(45, 'rectangle')).toBe(false);
    expect(shouldRequireRoofManualReview(61, 'rectangle')).toBe(true);
    expect(shouldRequireRoofManualReview(30, 'complex')).toBe(true);
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
