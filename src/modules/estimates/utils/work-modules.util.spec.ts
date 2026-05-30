import type { EstimateBlueprintConfig } from '../../../../prisma/estimate-blueprint-config.types';
import {
  getDefaultEnabledWorkModules,
  isPricingRuleActive,
  readEnabledWorkModules,
} from './work-modules.util';

describe('work modules util', () => {
  const config: EstimateBlueprintConfig = {
    wizardSteps: ['diagnostic'],
    siteTypes: [],
    planPointTypes: [],
    workModules: [
      {
        key: 'paint',
        label: 'Vopsire',
        defaultEnabled: true,
        stageCodes: ['vopsea'],
        fieldKeys: ['paintArea'],
      },
      {
        key: 'tile',
        label: 'Faianță',
        defaultEnabled: false,
        stageCodes: ['gresie'],
        fieldKeys: ['tileArea'],
      },
    ],
    diagnosticQuestions: [],
    defaultStages: [],
    pricingRules: [
      {
        stageCode: 'vopsea',
        description: 'Vopsire',
        unit: 'm²',
        qtyKey: 'paintArea',
        unitPrice: 45,
        kind: 'labor',
        moduleKey: 'paint',
      },
      {
        stageCode: 'gresie',
        description: 'Faianță',
        unit: 'm²',
        qtyKey: 'tileArea',
        unitPrice: 120,
        kind: 'labor',
        moduleKey: 'tile',
      },
    ],
    defaultLaborRate: 100,
    defaultMarginPct: 10,
  };

  it('returns default enabled modules when diagnostic is empty', () => {
    expect(getDefaultEnabledWorkModules(config)).toEqual(['paint']);
    expect(readEnabledWorkModules({}, config)).toEqual(['paint']);
  });

  it('reads explicit enabledWorkModules from diagnostic', () => {
    expect(
      readEnabledWorkModules({ enabledWorkModules: ['paint', 'tile'] }, config),
    ).toEqual(['paint', 'tile']);
  });

  it('preserves empty enabledWorkModules array when explicitly empty', () => {
    expect(
      readEnabledWorkModules({ enabledWorkModules: [] }, config),
    ).toEqual([]);
  });

  it('filters pricing rules by enabled modules', () => {
    const measurements = { paintArea: 20, tileArea: 10 };
    const paintRule = config.pricingRules[0]!;
    const tileRule = config.pricingRules[1]!;

    expect(isPricingRuleActive(paintRule, ['paint'], measurements, config)).toBe(true);
    expect(isPricingRuleActive(tileRule, ['paint'], measurements, config)).toBe(false);
  });
});
