import { isStageDefaultLaborChargeable } from './estimate-stages.service';
import { lucrariFinisajBlueprint } from '../../../../../prisma/estimate-blueprints/categories/lucrari-finisaj.blueprint';
import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprint-config.types';

describe('isStageDefaultLaborChargeable (phantom stage-default labor guard)', () => {
  const config = lucrariFinisajBlueprint as EstimateBlueprintConfig;
  const defByCode = new Map(config.defaultStages.map((s) => [s.code, s]));

  it('does NOT charge an optional stage whose module is disabled', () => {
    expect(
      isStageDefaultLaborChargeable(defByCode.get('gresie_faianta'), ['paint'], config, {}),
    ).toBe(false);
  });

  it('does NOT charge an optional stage enabled but with a required quantity still 0', () => {
    expect(
      isStageDefaultLaborChargeable(defByCode.get('gresie_faianta'), ['tile'], config, { tileArea: 0 }),
    ).toBe(false);
  });

  it('charges an optional stage when its module is enabled and quantity present', () => {
    expect(
      isStageDefaultLaborChargeable(defByCode.get('gresie_faianta'), ['tile'], config, { tileArea: 12 }),
    ).toBe(true);
  });

  it('always charges a required (non-optional) stage', () => {
    expect(isStageDefaultLaborChargeable(defByCode.get('glet'), [], config, {})).toBe(true);
  });
});
