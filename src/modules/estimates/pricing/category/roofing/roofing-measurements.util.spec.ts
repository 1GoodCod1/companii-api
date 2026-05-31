import {
  computeRoofAreaFromSlope,
  deriveAcoperisMeasurements,
  deriveValleyLengthFromShape,
  resolveRoofShapeMultiplier,
  shouldRequireRoofManualReview,
} from './roofing-measurements.util';

describe('roofing measurements (acoperis)', () => {
  it('computes roof area using cos(radians) without hidden wastage', () => {
    const baseArea = 100;
    const slope = 30;
    const expected = Math.round((baseArea / Math.cos((slope * Math.PI) / 180)) * 100) / 100;

    expect(computeRoofAreaFromSlope(baseArea, slope)).toBe(expected);
  });

  it('guards steep slopes near upper limit (70°+)', () => {
    expect(computeRoofAreaFromSlope(100, 74)).toBe(115);
    expect(computeRoofAreaFromSlope(100, 75)).toBe(115);
  });

  it('uses real geometry for 10x8 gable roof ridge, gutters and overhang-adjusted area', () => {
    const result = deriveAcoperisMeasurements(
      {
        rooms: [{ id: '1', name: 'Casa', width: 10, height: 8, shapeType: 'rectangle', roofType: 'gable' }],
        points: Array.from({ length: 20 }, (_, i) => ({ id: `g${i}`, type: 'gutter' })),
        globalParameters: { workContext: 'roof', roofOverhangM: 0.4 },
      },
      { baseArea: 80, roofSlope: 30, roofShape: 'rectangle' },
      {},
    );

    expect(result.ridgeLengthM).toBe(10.8);
    expect(result.gutterLengthM).toBe(39.2);
    expect(result.roofArea).toBe(round2((10.8 * 8.8) / Math.cos((30 * Math.PI) / 180)));
  });

  it('derives complexity, valleys and manual review flags', () => {
    const result = deriveAcoperisMeasurements(
      { rooms: [{ id: '1', name: 'Corp', width: 10, height: 10, shapeType: 'l-shape' }], points: [{ id: 's1', type: 'skylight' }] },
      { baseArea: 80, roofSlope: 65, roofShape: 'complex', oldRoofRemoval: true, insulationRequired: true },
      {},
    );

    expect(result.roofAreaLabor).toBe(round2(result.roofArea * 1.5));
    expect(result.valleyLengthM).toBe(24);
    expect(result.oldRoofRemovalArea).toBe(result.roofArea);
    expect(result.insulationArea).toBe(result.roofArea);
    expect(result.skylightCount).toBe(1);
    expect(result.requiresManualReview).toBe(1);
    expect(result.requiresInteractiveDrawing).toBe(1);
    expect(result.roofGeometryComplexityScore).toBeGreaterThan(0);
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
