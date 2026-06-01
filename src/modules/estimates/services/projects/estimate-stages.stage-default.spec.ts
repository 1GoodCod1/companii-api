import { filterChargeableStages, isStageDefaultLaborChargeable } from './estimate-stages.service';
import { lucrariFinisajBlueprint } from '../../../../../prisma/estimate-blueprints/categories/lucrari-finisaj.blueprint';
import { climaBlueprint } from '../../../../../prisma/estimate-blueprints/categories/clima.blueprint';
import { elektrikaBlueprint } from '../../../../../prisma/estimate-blueprints/categories/elektrika.blueprint';
import { constructiiBlueprint } from '../../../../../prisma/estimate-blueprints/categories/constructii.blueprint';
import { cleaningBlueprint } from '../../../../../prisma/estimate-blueprints/categories/cleaning.blueprint';
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

  it('does NOT charge stage-default when module requiresQtyKeys are all zero (non-optional stage)', () => {
    const elektrikaConfig = elektrikaBlueprint as EstimateBlueprintConfig;
    const traseeStage = elektrikaConfig.defaultStages.find((s) => s.code === 'trasee');

    expect(
      isStageDefaultLaborChargeable(
        traseeStage,
        ['chasing'],
        elektrikaConfig,
        { wallChasingM: 0 },
      ),
    ).toBe(false);
  });

  it('does NOT charge constructii placa stage-default when slabAreaTotal is zero', () => {
    const constructiiConfig = constructiiBlueprint as EstimateBlueprintConfig;
    const placaStage = constructiiConfig.defaultStages.find((s) => s.code === 'placa');

    expect(
      isStageDefaultLaborChargeable(
        placaStage,
        ['slab'],
        constructiiConfig,
        { slabAreaTotal: 0 },
      ),
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

  it('does NOT charge cleaning geamuri stage-default when window count is zero', () => {
    const cleaningConfig = cleaningBlueprint as EstimateBlueprintConfig;
    const geamuriStage = cleaningConfig.defaultStages.find((s) => s.code === 'geamuri');

    expect(
      isStageDefaultLaborChargeable(
        geamuriStage,
        ['windows'],
        cleaningConfig,
        { windowCleanCount: 0 },
      ),
    ).toBe(false);
  });

  it('does NOT charge cleaning special stage-default when trash module is off and no trash qty', () => {
    const cleaningConfig = cleaningBlueprint as EstimateBlueprintConfig;
    const specialStage = cleaningConfig.defaultStages.find((s) => s.code === 'special');

    expect(
      isStageDefaultLaborChargeable(
        specialStage,
        ['standard_cleaning'],
        cleaningConfig,
        { trashRemovalUnits: 0, postConstructionAreaLabor: 0 },
      ),
    ).toBe(false);
  });

  it('always charges a required (non-optional) stage without moduleKey', () => {
    expect(isStageDefaultLaborChargeable({ optional: false }, [], config, {})).toBe(true);
  });

  it('filterChargeableStages respects enabledWorkModules for elektrika custom labor split', () => {
    const elektrikaConfig = elektrikaBlueprint as EstimateBlueprintConfig;
    const defByCode = new Map(elektrikaConfig.defaultStages.map((s) => [s.code, s]));
    const stages = elektrikaConfig.defaultStages.map((stage, index) => ({
      id: `stage-${index}`,
      code: stage.code,
    }));
    const measurements = { roomCount: 4, electricPoints: 16, wallChasingM: 0 };

    const chargeable = filterChargeableStages(
      stages,
      defByCode,
      ['project', 'devices'],
      elektrikaConfig,
      measurements,
    );

    expect(chargeable.map((stage) => stage.code)).toEqual(['proiect', 'aparataj']);
  });
});
