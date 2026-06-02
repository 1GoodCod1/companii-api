import {
  ESTIMATE_MEASUREMENT_UNITS,
  isEstimateMeasurementUnit,
  normalizeEstimateUnit,
} from '../../../../../prisma/estimate-measurement-units';
import { collectBlueprintUnitIssues } from './estimate-unit-validation.util';
import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprint-config.types';

describe('estimate measurement units', () => {
  it('accepts canonical units', () => {
    for (const unit of ESTIMATE_MEASUREMENT_UNITS) {
      expect(normalizeEstimateUnit(unit)).toBe(unit);
      expect(isEstimateMeasurementUnit(unit)).toBe(true);
    }
  });

  it('normalizes common aliases', () => {
    expect(normalizeEstimateUnit('m2')).toBe('m²');
    expect(normalizeEstimateUnit('m3')).toBe('m³');
    expect(normalizeEstimateUnit('h')).toBe('ore');
    expect(normalizeEstimateUnit('kwh')).toBe('kWh');
  });

  it('rejects unknown units', () => {
    expect(normalizeEstimateUnit('sac')).toBeNull();
    expect(normalizeEstimateUnit('tub')).toBeNull();
    expect(isEstimateMeasurementUnit('litru')).toBe(false);
  });
});

describe('collectBlueprintUnitIssues', () => {
  const validConfig: EstimateBlueprintConfig = {
    wizardSteps: ['object', 'diagnostic', 'review'],
    siteTypes: [],
    planPointTypes: [],
    diagnosticQuestions: [],
    defaultStages: [],
    pricingRules: [
      {
        stageCode: 'test',
        description: 'Test line',
        unit: 'm²',
        qtyKey: 'finishArea',
        unitPrice: 10,
      },
    ],
    defaultLaborRate: 100,
    defaultMarginPct: 10,
  };

  it('returns no issues for valid config', () => {
    expect(collectBlueprintUnitIssues(validConfig)).toEqual([]);
  });

  it('flags invalid pricing rule units', () => {
    const issues = collectBlueprintUnitIssues({
      ...validConfig,
      pricingRules: [
        {
          stageCode: 'test',
          description: 'Bad unit',
          unit: 'sac' as 'm²',
          qtyKey: 'finishArea',
          unitPrice: 10,
        },
      ],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.unit).toBe('sac');
  });
});
