import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('defines check method', () => {
    const ctrl = new HealthController({} as never);
    expect(typeof ctrl.check).toBe('function');
  });
});
