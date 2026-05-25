export type BlueprintStageDef = {
  code: string;
  name: string;
  kind: 'LABOR' | 'MATERIAL' | 'MIXED';
  description?: string;
  defaultLaborHours?: number;
  defaultLaborRate?: number;
  durationDays?: number;
  checklist?: string[];
};

export type BlueprintPricingRule = {
  stageCode: string;
  description: string;
  unit: string;
  qtyKey: string;
  unitPrice: number;
  wastePct?: number;
  kind?: 'labor' | 'material';
};

export type BlueprintDiagnosticQuestion = {
  key: string;
  label: string;
  type: 'boolean' | 'number' | 'select';
  options?: string[];
  affectsKey?: string;
  increment?: number;
};

export type EstimateBlueprintConfig = {
  wizardSteps: Array<'object' | 'plan' | 'diagnostic' | 'stages' | 'review'>;
  siteTypes: Array<{ value: string; label: string }>;
  planPointTypes: Array<{ type: string; label: string; color: string }>;
  diagnosticQuestions: BlueprintDiagnosticQuestion[];
  defaultStages: BlueprintStageDef[];
  pricingRules: BlueprintPricingRule[];
  defaultLaborRate: number;
  defaultMarginPct: number;
};

const SITE_TYPES: EstimateBlueprintConfig['siteTypes'] = [
  { value: 'apartment', label: 'Apartament' },
  { value: 'house', label: 'Casă' },
  { value: 'commercial', label: 'Spațiu comercial' },
];

function baseConfig(
  overrides: Partial<EstimateBlueprintConfig> & Pick<EstimateBlueprintConfig, 'defaultStages' | 'pricingRules' | 'diagnosticQuestions' | 'planPointTypes'>,
): EstimateBlueprintConfig {
  return {
    wizardSteps: ['object', 'plan', 'diagnostic', 'stages', 'review'],
    siteTypes: SITE_TYPES,
    defaultLaborRate: 180,
    defaultMarginPct: 12,
    ...overrides,
  };
}

const CATEGORY_BLUEPRINTS: Record<string, EstimateBlueprintConfig> = {
  santehnika: baseConfig({
    planPointTypes: [
      { type: 'water', label: 'Apă rece/caldă', color: '#3b82f6' },
      { type: 'drain', label: 'Canalizare', color: '#64748b' },
      { type: 'mixer', label: 'Baterie / mixer', color: '#06b6d4' },
      { type: 'toilet', label: 'WC', color: '#8b5cf6' },
    ],
    diagnosticQuestions: [
      { key: 'replacePipes', label: 'Înlocuire completă țevi?', type: 'boolean', affectsKey: 'pipeLengthM', increment: 15 },
      { key: 'bathroomCount', label: 'Număr băi', type: 'number' },
      { key: 'waterHeater', label: 'Montaj boiler', type: 'boolean', affectsKey: 'waterHeaterCount', increment: 1 },
      { key: 'accessDifficulty', label: 'Acces dificil', type: 'select', options: ['ușor', 'mediu', 'dificil'] },
    ],
    defaultStages: [
      { code: 'demontare', name: 'Demontare', kind: 'LABOR', defaultLaborHours: 3, durationDays: 1, checklist: ['Oprire apă', 'Protejare finisaje'] },
      { code: 'tevi', name: 'Montaj țevi', kind: 'MIXED', defaultLaborHours: 6, durationDays: 2, checklist: ['Traseu aprobat', 'Presiune test'] },
      { code: 'obiecte', name: 'Montaj obiecte sanitare', kind: 'MIXED', defaultLaborHours: 4, durationDays: 1, checklist: ['Etanșare', 'Scurgere OK'] },
      { code: 'test', name: 'Test & predare', kind: 'LABOR', defaultLaborHours: 1, durationDays: 1, checklist: ['Fără scurgeri', 'Client informat'] },
    ],
    pricingRules: [
      { stageCode: 'tevi', description: 'Țeavă PPR + fitinguri', unit: 'm', qtyKey: 'pipeLengthM', unitPrice: 95, wastePct: 8, kind: 'material' },
      { stageCode: 'tevi', description: 'Manoperă montaj țevi', unit: 'm', qtyKey: 'pipeLengthM', unitPrice: 65, kind: 'labor' },
      { stageCode: 'obiecte', description: 'Punct apă / canalizare', unit: 'buc', qtyKey: 'plumbingPoints', unitPrice: 450, kind: 'labor' },
      { stageCode: 'obiecte', description: 'Montaj boiler', unit: 'buc', qtyKey: 'waterHeaterCount', unitPrice: 850, kind: 'labor' },
    ],
  }),
  elektrika: baseConfig({
    planPointTypes: [
      { type: 'socket', label: 'Priză', color: '#f59e0b' },
      { type: 'switch', label: 'Întrerupător', color: '#eab308' },
      { type: 'light', label: 'Lumină', color: '#fbbf24' },
      { type: 'panel', label: 'Tablou electric', color: '#ef4444' },
    ],
    diagnosticQuestions: [
      { key: 'newPanel', label: 'Tablou electric nou', type: 'boolean', affectsKey: 'panelCount', increment: 1 },
      { key: 'cableReplace', label: 'Înlocuire cabluri', type: 'boolean', affectsKey: 'cableLengthM', increment: 25 },
      { key: 'roomCount', label: 'Număr camere', type: 'number' },
    ],
    defaultStages: [
      { code: 'proiect', name: 'Proiect & traseu', kind: 'LABOR', defaultLaborHours: 2, durationDays: 1, checklist: ['Plan aprobat'] },
      { code: 'cablare', name: 'Cablare', kind: 'MIXED', defaultLaborHours: 8, durationDays: 2, checklist: ['Secțiuni corecte'] },
      { code: 'tablou', name: 'Montaj tablou', kind: 'MIXED', defaultLaborHours: 3, durationDays: 1, checklist: ['Protecții montate'] },
      { code: 'punere', name: 'Punere în funcțiune', kind: 'LABOR', defaultLaborHours: 2, durationDays: 1, checklist: ['Test RCD', 'Etichete'] },
    ],
    pricingRules: [
      { stageCode: 'cablare', description: 'Cablu + tub', unit: 'm', qtyKey: 'cableLengthM', unitPrice: 45, wastePct: 10, kind: 'material' },
      { stageCode: 'cablare', description: 'Manoperă cablare', unit: 'm', qtyKey: 'cableLengthM', unitPrice: 35, kind: 'labor' },
      { stageCode: 'cablare', description: 'Punct electric (priză/întrerupător)', unit: 'buc', qtyKey: 'electricPoints', unitPrice: 220, kind: 'labor' },
      { stageCode: 'tablou', description: 'Tablou electric', unit: 'buc', qtyKey: 'panelCount', unitPrice: 1800, kind: 'material' },
    ],
  }),
  plitka: baseConfig({
    planPointTypes: [
      { type: 'floor', label: 'Pardoseală', color: '#78716c' },
      { type: 'wall', label: 'Perete', color: '#a8a29e' },
      { type: 'niche', label: 'Nișă / decor', color: '#d6d3d1' },
    ],
    diagnosticQuestions: [
      { key: 'floorArea', label: 'Suprafață pardoseală (m²)', type: 'number' },
      { key: 'wallArea', label: 'Suprafață perete (m²)', type: 'number' },
      { key: 'largeFormat', label: 'Placă format mare (>60cm)', type: 'boolean' },
      { key: 'oldTileRemove', label: 'Demontare placă veche', type: 'boolean', affectsKey: 'demolitionArea', increment: 10 },
    ],
    defaultStages: [
      { code: 'pregatire', name: 'Pregătire suprafață', kind: 'LABOR', defaultLaborHours: 4, durationDays: 1, checklist: ['Nivelare', 'Grund'] },
      { code: 'lipire', name: 'Lipire placă', kind: 'MIXED', defaultLaborHours: 10, durationDays: 3, checklist: ['Uniformitate rost'] },
      { code: 'rosturi', name: 'Rosturi & finisaj', kind: 'MIXED', defaultLaborHours: 3, durationDays: 1, checklist: ['Curățare', 'Silicon colțuri'] },
    ],
    pricingRules: [
      { stageCode: 'lipire', description: 'Placă ceramică (material)', unit: 'm²', qtyKey: 'tileFloorArea', unitPrice: 320, wastePct: 10, kind: 'material' },
      { stageCode: 'lipire', description: 'Manoperă pardoseală', unit: 'm²', qtyKey: 'tileFloorArea', unitPrice: 180, kind: 'labor' },
      { stageCode: 'lipire', description: 'Manoperă perete', unit: 'm²', qtyKey: 'tileWallArea', unitPrice: 210, kind: 'labor' },
      { stageCode: 'pregatire', description: 'Demontare placă veche', unit: 'm²', qtyKey: 'demolitionArea', unitPrice: 55, kind: 'labor' },
    ],
  }),
};

function genericBlueprint(categoryName: string, slug: string): EstimateBlueprintConfig {
  const templates: Record<string, Partial<EstimateBlueprintConfig>> = {
    'kondicionery-otoplenie': {
      planPointTypes: [
        { type: 'indoor', label: 'Unitate interior', color: '#0ea5e9' },
        { type: 'outdoor', label: 'Unitate exterior', color: '#0284c7' },
        { type: 'route', label: 'Traseu freon', color: '#38bdf8' },
      ],
      defaultStages: [
        { code: 'montaj', name: 'Montaj unități', kind: 'MIXED', defaultLaborHours: 6, durationDays: 1 },
        { code: 'traseu', name: 'Traseu & vacuum', kind: 'MIXED', defaultLaborHours: 4, durationDays: 1 },
        { code: 'test', name: 'Test & reglaj', kind: 'LABOR', defaultLaborHours: 2, durationDays: 1 },
      ],
      pricingRules: [
        { stageCode: 'montaj', description: 'Split AC montaj', unit: 'buc', qtyKey: 'acUnits', unitPrice: 1200, kind: 'labor' },
        { stageCode: 'traseu', description: 'Traseu freon', unit: 'm', qtyKey: 'routeLengthM', unitPrice: 120, kind: 'material' },
      ],
      diagnosticQuestions: [{ key: 'acUnits', label: 'Număr aparate', type: 'number' }],
    },
    'otdelochnye-raboty': {
      defaultStages: [
        { code: 'pregatire', name: 'Pregătire', kind: 'LABOR', defaultLaborHours: 4, durationDays: 1 },
        { code: 'finisaj', name: 'Lucrări finisaj', kind: 'MIXED', defaultLaborHours: 12, durationDays: 3 },
        { code: 'predare', name: 'Predare', kind: 'LABOR', defaultLaborHours: 1, durationDays: 1 },
      ],
      pricingRules: [
        { stageCode: 'finisaj', description: 'Manoperă finisaj', unit: 'm²', qtyKey: 'finishArea', unitPrice: 150, kind: 'labor' },
      ],
      diagnosticQuestions: [{ key: 'finishArea', label: 'Suprafață totală (m²)', type: 'number' }],
      planPointTypes: [{ type: 'zone', label: 'Zonă lucru', color: '#a855f7' }],
    },
    'master-na-chas': {
      wizardSteps: ['object', 'diagnostic', 'stages', 'review'],
      defaultStages: [{ code: 'lucrari', name: 'Lucrări la oră', kind: 'LABOR', defaultLaborHours: 2, durationDays: 1 }],
      pricingRules: [{ stageCode: 'lucrari', description: 'Manoperă meșter', unit: 'ore', qtyKey: 'laborHours', unitPrice: 200, kind: 'labor' }],
      diagnosticQuestions: [{ key: 'laborHours', label: 'Ore estimate', type: 'number' }],
      planPointTypes: [],
    },
    'uborka': {
      wizardSteps: ['object', 'diagnostic', 'stages', 'review'],
      defaultStages: [
        { code: 'curatenie', name: 'Curățenie generală', kind: 'LABOR', defaultLaborHours: 4, durationDays: 1 },
        { code: 'detaliu', name: 'Detaliu & geamuri', kind: 'LABOR', defaultLaborHours: 2, durationDays: 1 },
      ],
      pricingRules: [
        { stageCode: 'curatenie', description: 'Curățenie', unit: 'm²', qtyKey: 'cleanArea', unitPrice: 25, kind: 'labor' },
      ],
      diagnosticQuestions: [{ key: 'cleanArea', label: 'Suprafață (m²)', type: 'number' }],
      planPointTypes: [{ type: 'room', label: 'Cameră', color: '#22c55e' }],
    },
  };

  const custom = templates[slug];
  if (custom) {
    return baseConfig({
      planPointTypes: custom.planPointTypes ?? [{ type: 'zone', label: 'Zonă', color: '#6366f1' }],
      diagnosticQuestions: custom.diagnosticQuestions ?? [{ key: 'workScope', label: 'Descriere volum', type: 'number' }],
      defaultStages: custom.defaultStages ?? [
        { code: 'lucrari', name: `Lucrări ${categoryName}`, kind: 'MIXED', defaultLaborHours: 4, durationDays: 1 },
      ],
      pricingRules: custom.pricingRules ?? [
        { stageCode: 'lucrari', description: `Manoperă ${categoryName}`, unit: 'ore', qtyKey: 'laborHours', unitPrice: 180, kind: 'labor' },
      ],
      wizardSteps: custom.wizardSteps,
    });
  }

  return baseConfig({
    planPointTypes: [{ type: 'zone', label: 'Zonă de lucru', color: '#6366f1' }],
    diagnosticQuestions: [
      { key: 'workScope', label: 'Volum estimat (ore)', type: 'number' },
      { key: 'materialsIncluded', label: 'Materiale incluse', type: 'boolean' },
    ],
    defaultStages: [
      { code: 'diagnostic', name: 'Diagnostic & planificare', kind: 'LABOR', defaultLaborHours: 1, durationDays: 1, checklist: ['Evaluare la fața locului'] },
      { code: 'executie', name: `Execuție ${categoryName}`, kind: 'MIXED', defaultLaborHours: 6, durationDays: 2, checklist: ['Conform plan'] },
      { code: 'predare', name: 'Predare & garanție', kind: 'LABOR', defaultLaborHours: 1, durationDays: 1, checklist: ['Accept client'] },
    ],
    pricingRules: [
      { stageCode: 'executie', description: `Manoperă ${categoryName}`, unit: 'ore', qtyKey: 'laborHours', unitPrice: 190, kind: 'labor' },
      { stageCode: 'executie', description: 'Materiale consumabile', unit: 'buc', qtyKey: 'materialUnits', unitPrice: 350, kind: 'material' },
    ],
  });
}

export function buildBlueprintConfig(category: { name: string; slug: string }): EstimateBlueprintConfig {
  return CATEGORY_BLUEPRINTS[category.slug] ?? genericBlueprint(category.name, category.slug);
}

export function buildBlueprintName(categoryName: string): string {
  return `Smetă inteligentă — ${categoryName}`;
}
