import type { EstimateBlueprintConfig } from '../estimate-blueprint-config.types';
import { baseConfig } from './base';

export function genericBlueprint(categoryName: string): EstimateBlueprintConfig {
  return baseConfig({
    planPointTypes: [{ type: 'zone', label: 'Zonă de lucru', color: '#6366f1' }],
    diagnosticQuestions: [
      { key: 'workScope', label: 'Volum estimat (ore)', type: 'number' },
      { key: 'materialsIncluded', label: 'Materiale incluse', type: 'boolean' },
    ],
    defaultStages: [
      {
        code: 'diagnostic',
        name: 'Diagnostic & planificare',
        kind: 'LABOR',
        defaultLaborHours: 1,
        durationDays: 1,
        checklist: ['Evaluare la fața locului'],
      },
      {
        code: 'executie',
        name: `Execuție ${categoryName}`,
        kind: 'MIXED',
        defaultLaborHours: 6,
        durationDays: 2,
        checklist: ['Conform plan'],
      },
      {
        code: 'predare',
        name: 'Predare & garanție',
        kind: 'LABOR',
        defaultLaborHours: 1,
        durationDays: 1,
        checklist: ['Accept client'],
      },
    ],
    pricingRules: [
      {
        stageCode: 'executie',
        description: `Manoperă ${categoryName}`,
        unit: 'ore',
        qtyKey: 'laborHours',
        unitPrice: 195,
        kind: 'labor',
      },
      {
        stageCode: 'executie',
        description: 'Materiale consumabile',
        unit: 'buc',
        qtyKey: 'materialUnits',
        unitPrice: 350,
        kind: 'material',
      },
    ],
  });
}
