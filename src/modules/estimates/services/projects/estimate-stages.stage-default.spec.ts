import { isStageDefaultLaborChargeable } from './estimate-stages.service';
import { lucrariFinisajBlueprint } from '../../../../../prisma/estimate-blueprints/categories/lucrari-finisaj.blueprint';
import { climaBlueprint } from '../../../../../prisma/estimate-blueprints/categories/clima.blueprint';
import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprint-config.types';

describe('isStageDefaultLaborChargeable (phantom stage-default labor guard)', () => {
  const config = lucrariFinisajBlueprint as EstimateBlueprintConfig;
  const defByCode = new Map(config.defaultStages.map((s) => [s.code, s]));
  const climaConfig = climaBlueprint as EstimateBlueprintConfig;
  const climaStageByCode = new Map(climaConfig.defaultStages.map((s) => [s.code, s]));

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

  it('does NOT charge a required stage when its module is disabled', () => {
    expect(
      isStageDefaultLaborChargeable(climaStageByCode.get('montaj'), [], climaConfig, {}),
    ).toBe(false);
  });

  it('charges a required stage when its module is enabled', () => {
    expect(
      isStageDefaultLaborChargeable(
        climaStageByCode.get('montaj'),
        ['indoor_outdoor_units'],
        climaConfig,
        {},
      ),
    ).toBe(true);
  });

  it('always charges a required (non-optional) stage without moduleKey', () => {
    expect(isStageDefaultLaborChargeable({ optional: false }, [], config, {})).toBe(true);
  });
});
