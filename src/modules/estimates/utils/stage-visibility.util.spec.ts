import type { EstimateBlueprintConfig } from '../../../../prisma/estimate-blueprint-config.types';
import {
  computeStageVisibility,
  filterStagesWithMeaningfulLines,
  getVisibleStages,
} from './stage-visibility.util';

const config: EstimateBlueprintConfig = {
  wizardSteps: ['object', 'diagnostic', 'stages', 'review'],
  siteTypes: [],
  planPointTypes: [],
  workModules: [
    { key: 'devices', label: 'Aparataj', defaultEnabled: true, stageCodes: ['aparataj'], fieldKeys: [] },
    { key: 'cabling', label: 'Cablare', defaultEnabled: true, stageCodes: ['cablare'], fieldKeys: [] },
    { key: 'chasing', label: 'Ștrobire', defaultEnabled: true, stageCodes: ['trasee'], fieldKeys: [] },
  ],
  customFields: [],
  diagnosticQuestions: [],
  defaultStages: [
    { code: 'trasee', name: 'Ștrobire', kind: 'LABOR', moduleKey: 'chasing' },
    { code: 'cablare', name: 'Cablare', kind: 'MIXED', moduleKey: 'cabling' },
    { code: 'aparataj', name: 'Montaj aparataj', kind: 'MIXED', moduleKey: 'devices' },
  ],
  pricingRules: [],
  defaultLaborRate: 185,
  defaultMarginPct: 20,
};

describe('stage visibility util', () => {
  it('hides disabled-module stages without meaningful lines', () => {
    const stages = [
      { code: 'trasee', lines: [] },
      { code: 'cablare', lines: [{ source: 'rule' }] },
      { code: 'aparataj', lines: [{ source: 'rule' }, { source: 'rule' }] },
    ];

    const visible = getVisibleStages(stages, config, ['devices', 'cabling']);
    expect(visible.map((s) => s.code)).toEqual(['cablare', 'aparataj']);
  });

  it('ignores stage-default lines when counting meaningful lines', () => {
    const result = computeStageVisibility(
      [{ code: 'trasee', lines: [{ source: 'stage-default' }] }],
      config,
      ['chasing'],
    );
    expect(result[0]?.hidden).toBe(false);
    expect(result[0]?.meaningfulLineCount).toBe(0);
  });

  it('filters empty stages for worksheet display', () => {
    const stages = [
      { code: 'trasee', lines: [{ source: 'stage-default' }], stageTotal: 0 },
      { code: 'aparataj', lines: [{ source: 'rule' }], stageTotal: 1500 },
    ];
    expect(filterStagesWithMeaningfulLines(stages).map((s) => s.code)).toEqual(['aparataj']);
  });
});
