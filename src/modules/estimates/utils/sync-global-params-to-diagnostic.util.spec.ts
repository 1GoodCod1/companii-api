import { syncGlobalParamsToDiagnostic } from './sync-global-params-to-diagnostic.util';
import { ENABLED_WORK_MODULES_KEY } from './work-modules.util';
import type { Plan2dData } from '../pricing/plan2d.types';

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
