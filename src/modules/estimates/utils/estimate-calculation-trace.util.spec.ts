import { EstimatePricingEngine } from '../pricing/pricing-engine.service';
import {
  buildCalculationTrace,
  filterPersistableMeasurements,
  resolveRequiresManualReview,
} from './estimate-calculation-trace.util';

describe('estimate-calculation-trace.util (E-05, E-07)', () => {
  const engine = new EstimatePricingEngine();

  it('E-05: tags plan, diagnostic, fallback and computed measurement sources', () => {
    const trace = buildCalculationTrace(
      {
        totalFloorArea: 30,
        roomCount: 1,
        wallArea: 75,
        finishArea: 30,
        tileArea: 0,
        paintAreaLabor: 136.5,
      },
      { rooms: [{ id: '1', name: 'Living', width: 5, height: 6 }], points: [] },
      { finishArea: 30, enabledWorkModules: ['paint'] },
    );

    expect(trace.find((entry) => entry.key === 'totalFloorArea')).toMatchObject({
      value: 30,
      unit: 'm²',
      source: 'plan',
    });
    expect(trace.find((entry) => entry.key === 'finishArea')).toMatchObject({
      value: 30,
      source: 'diagnostic',
    });
    expect(trace.find((entry) => entry.key === 'wallArea')).toMatchObject({
      value: 75,
      source: 'fallback',
    });
    expect(trace.find((entry) => entry.key === 'paintAreaLabor')).toMatchObject({
      source: 'computed',
    });
    expect(trace.some((entry) => entry.key === 'requiresManualReview')).toBe(false);
  });

  it('E-07: resolves manual review flag from category measurements', () => {
    const roofMeasurements = engine.deriveMeasurements(
      null,
      { baseArea: 80, roofSlope: 65, roofShape: 'complex' },
      'acoperis',
    );
    expect(resolveRequiresManualReview(roofMeasurements)).toBe(true);

    const itMeasurements = engine.deriveMeasurements(
      null,
      { projectScope: 'enterprise' },
      'it-web',
    );
    expect(resolveRequiresManualReview(itMeasurements)).toBe(true);

    const normalMeasurements = engine.deriveMeasurements(
      null,
      { finishArea: 25, enabledWorkModules: ['paint'] },
      'lucrari-finisaj',
    );
    expect(resolveRequiresManualReview(normalMeasurements)).toBe(false);
  });

  it('filters internal measurement flags before persistence', () => {
    const filtered = filterPersistableMeasurements({
      finishArea: 30,
      requiresManualReview: 1,
      preliminaryEstimate: 1,
    });

    expect(filtered).toEqual({ finishArea: 30 });
  });
});
