import { syncGlobalParamsToDiagnostic } from './sync-global-params-to-diagnostic.util';
import { ENABLED_WORK_MODULES_KEY } from '../blueprint/work-modules.util';
import type { Plan2dData } from '../../pricing/plan2d.types';

function plan(partial: Partial<Plan2dData>): Plan2dData {
  return {
    rooms: [],
    points: [],
    ...partial,
  };
}

describe('syncGlobalParamsToDiagnostic — backend mirror of I-01/I-02/I-03', () => {
  it('roof context: baseArea → roofArea only (I-02)', () => {
    const result = syncGlobalParamsToDiagnostic(
      plan({ globalParameters: { workContext: 'roof', baseArea: 120 } }),
      {},
    );
    expect(result.roofArea).toBe(120);
    expect(result.finishArea).toBeUndefined();
    expect(result.builtArea).toBeUndefined();
    expect(result.pavementArea).toBeUndefined();
  });

  it('indoor context: baseArea → finishArea + cleanArea', () => {
    const result = syncGlobalParamsToDiagnostic(
      plan({ globalParameters: { workContext: 'indoor', baseArea: 60 } }),
      {},
    );
    expect(result.finishArea).toBe(60);
    expect(result.cleanArea).toBe(60);
    expect(result.roofArea).toBeUndefined();
  });

  it('facade context: facadeArea ok, baseArea does not bleed into floor keys (I-02)', () => {
    const result = syncGlobalParamsToDiagnostic(
      plan({
        globalParameters: { workContext: 'facade', baseArea: 100, facadeArea: 240 },
      }),
      {},
    );
    expect(result.facadeArea).toBe(240);
    expect(result.scaffoldingArea).toBe(240);
    expect(result.finishArea).toBeUndefined();
    expect(result.cleanArea).toBeUndefined();
    expect(result.roofArea).toBeUndefined();
  });

  it('roofSlope only set when workContext = roof', () => {
    const roof = syncGlobalParamsToDiagnostic(
      plan({ globalParameters: { workContext: 'roof', roofSlope: 35 } }),
      {},
    );
    expect(roof.roofSlope).toBe(35);

    const indoor = syncGlobalParamsToDiagnostic(
      plan({ globalParameters: { workContext: 'indoor', roofSlope: 35 } }),
      {},
    );
    expect(indoor.roofSlope).toBeUndefined();
  });

  it('roof context syncs detailed geometry quantities for recalculation', () => {
    const result = syncGlobalParamsToDiagnostic(
      plan({
        rooms: [
          { id: 'r1', name: 'Plan principal', width: 10, height: 8, shapeType: 'rectangle', roofType: 'gable' },
          { id: 'r2', name: 'Extensie', width: 5, height: 4, shapeType: 'rectangle' },
        ],
        points: [
          { id: 'g1', type: 'gutter' },
          { id: 'g2', type: 'gutter' },
          { id: 'c1', type: 'chimney' },
          { id: 's1', type: 'skylight' },
        ],
        globalParameters: {
          workContext: 'roof',
          baseArea: 100,
          roofSlope: 30,
          roofOverhangM: 0.4,
          coveringType: 'ceramic_tile',
          membraneType: 'premium',
          insulationThicknessMm: 200,
          buildingHeightM: 7,
          scaffoldingRequired: true,
          snowGuardRows: 2,
        },
      }),
      { chimneyCount: 5, skylightCount: 3 },
    );

    expect(result.roofShape).toBe('complex');
    expect(result.roofOverhangM).toBe(0.4);
    expect(result.coveringType).toBe('ceramic_tile');
    expect(result.membraneType).toBe('premium');
    expect(result.insulationThicknessMm).toBe(200);
    expect(result.buildingHeightM).toBe(7);
    expect(result.scaffoldingRequired).toBe(true);
    expect(result.snowGuardRows).toBe(2);
    expect(result.ridgeLengthM).toBe(10.8);
    expect(result.gutterLengthM).toBe(39.2);
    expect(result.roofDripEdgeLengthM).toBe(39.2);
    expect(result.valleyLengthM).toBe(24);
    expect(result.wallIntersectionLengthM).toBe(8);
    expect(result.chimneyCount).toBe(1);
    expect(result.skylightCount).toBe(1);
  });

  it('plan never auto-enables work modules — sync preserves user choice (I-03)', () => {
    const result = syncGlobalParamsToDiagnostic(
      plan({
        points: [
          { id: '1', type: 'tile' },
          { id: '2', type: 'tile' },
        ],
        globalParameters: { workContext: 'indoor', baseArea: 50 },
      }),
      { [ENABLED_WORK_MODULES_KEY]: ['paint'] },
    );
    expect(result[ENABLED_WORK_MODULES_KEY]).toEqual(['paint']);
  });

  it('does not add enabledWorkModules when missing in input (I-03)', () => {
    const result = syncGlobalParamsToDiagnostic(
      plan({
        points: [{ id: '1', type: 'tile' }],
        globalParameters: { workContext: 'indoor', baseArea: 50 },
      }),
      {},
    );
    expect(result[ENABLED_WORK_MODULES_KEY]).toBeUndefined();
  });

  it('storyCount no longer hijacks roomCount', () => {
    const result = syncGlobalParamsToDiagnostic(
      plan({ globalParameters: { workContext: 'general', floorsCount: 3 } }),
      {},
    );
    expect(result.storyCount).toBe(3);
    expect(result.roomCount).toBeUndefined();
  });
});
