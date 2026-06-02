import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprint-config.types';
import { fatadeBlueprint } from '../../../../../prisma/estimate-blueprints/categories/fatade.blueprint';
import { lucrariFinisajBlueprint } from '../../../../../prisma/estimate-blueprints/categories/lucrari-finisaj.blueprint';
import {
  ENABLED_WORK_MODULES_KEY,
  mergeEnabledWorkModulesIntoDiagnostic,
} from './work-modules.util';
import {
  ESTIMATE_VALIDATION_FAILED,
  evaluateCustomFieldWarningRule,
  validateCustomFieldsAnswers,
} from './estimate-custom-fields-validation.util';

describe('estimate custom fields validation (D-01–D-04)', () => {
  const tileRequiredConfig: EstimateBlueprintConfig = {
    ...lucrariFinisajBlueprint,
    customFields: (lucrariFinisajBlueprint.customFields ?? []).map((field) =>
      field.key === 'tileArea'
        ? { ...field, required: true, defaultValue: undefined }
        : field,
    ),
  };

  it('returns field-level errors with ESTIMATE_VALIDATION_FAILED code (D-01)', () => {
    const result = validateCustomFieldsAnswers(lucrariFinisajBlueprint, {
      finishArea: 'abc',
      paintArea: 200,
      [ENABLED_WORK_MODULES_KEY]: ['paint'],
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(ESTIMATE_VALIDATION_FAILED);
    expect(result.fields?.finishArea).toBe('Trebuie să fie un număr valid');
  });

  it('validates required, min, max and select options (D-01)', () => {
    const requiredResult = validateCustomFieldsAnswers(lucrariFinisajBlueprint, {
      finishArea: '',
      [ENABLED_WORK_MODULES_KEY]: ['paint'],
    });
    expect(requiredResult.ok).toBe(false);
    expect(requiredResult.fields?.finishArea).toContain('obligatoriu');

    const minMaxResult = validateCustomFieldsAnswers(
      {
        ...lucrariFinisajBlueprint,
        customFields: [
          {
            key: 'sampleCount',
            label: 'Sample count',
            type: 'number',
            required: true,
            validation: { min: 1, max: 10 },
          },
        ],
      },
      { sampleCount: 0, [ENABLED_WORK_MODULES_KEY]: [] },
    );
    expect(minMaxResult.fields?.sampleCount).toBe('Minim 1');

    const maxResult = validateCustomFieldsAnswers(
      {
        ...lucrariFinisajBlueprint,
        customFields: [
          {
            key: 'sampleCount',
            label: 'Sample count',
            type: 'number',
            required: false,
            validation: { min: 1, max: 10 },
          },
        ],
      },
      { sampleCount: 11, [ENABLED_WORK_MODULES_KEY]: [] },
    );
    expect(maxResult.fields?.sampleCount).toBe('Maxim 10');

    const selectResult = validateCustomFieldsAnswers(
      {
        ...lucrariFinisajBlueprint,
        customFields: [
          ...(lucrariFinisajBlueprint.customFields ?? []),
          {
            key: 'sampleSelect',
            label: 'Sample select',
            type: 'select',
            options: ['valid-option'],
            required: false,
          },
        ],
      },
      {
        finishArea: 30,
        paintArea: 30,
        sampleSelect: 'invalid-option',
        [ENABLED_WORK_MODULES_KEY]: ['paint'],
      },
    );
    expect(selectResult.fields?.sampleSelect).toBe('Opțiune invalidă');
  });

  it('does not require tileArea when tile module is disabled (D-02)', () => {
    const withoutTile = validateCustomFieldsAnswers(
      tileRequiredConfig,
      mergeEnabledWorkModulesIntoDiagnostic(
        { finishArea: 40, paintArea: 40, finishLevel: 'standard' },
        tileRequiredConfig,
      ),
    );

    expect(withoutTile.ok).toBe(true);
    expect(withoutTile.fields?.tileArea).toBeUndefined();
  });

  it('requires tileArea when tile module is enabled (D-02)', () => {
    const withTile = validateCustomFieldsAnswers(tileRequiredConfig, {
      finishArea: 40,
      paintArea: 40,
      finishLevel: 'standard',
      tileArea: '',
      [ENABLED_WORK_MODULES_KEY]: ['paint', 'tile'],
    });

    expect(withTile.ok).toBe(false);
    expect(withTile.fields?.tileArea).toContain('obligatoriu');
  });

  it('returns warning rules without blocking validation (D-03)', () => {
    const result = validateCustomFieldsAnswers(fatadeBlueprint, {
      facadeArea: 120,
      insulationThicknessCm: 4,
      [ENABLED_WORK_MODULES_KEY]: ['insulation'],
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'insulationThicknessCm',
          message: expect.stringContaining('5 cm'),
        }),
      ]),
    );
    expect(evaluateCustomFieldWarningRule('insulationThicknessCm < 5', { insulationThicknessCm: 4 })).toBe(
      true,
    );
  });

  it('rejects unknown diagnostic keys in strict mode (D-04)', () => {
    const result = validateCustomFieldsAnswers(
      lucrariFinisajBlueprint,
      {
        finishArea: 30,
        paintArea: 30,
        finishLevel: 'standard',
        unexpectedField: 'x',
        [ENABLED_WORK_MODULES_KEY]: ['paint'],
      },
      { strictUnknownKeys: true },
    );

    expect(result.ok).toBe(false);
    expect(result.fields?.unexpectedField).toBe('Câmp necunoscut');
  });

  it('ignores unknown diagnostic keys when strict mode is off (D-04)', () => {
    const result = validateCustomFieldsAnswers(
      lucrariFinisajBlueprint,
      {
        finishArea: 30,
        paintArea: 30,
        finishLevel: 'standard',
        unexpectedField: 'x',
        [ENABLED_WORK_MODULES_KEY]: ['paint'],
      },
      { strictUnknownKeys: false },
    );

    expect(result.ok).toBe(true);
    expect(result.fields?.unexpectedField).toBeUndefined();
  });
});
