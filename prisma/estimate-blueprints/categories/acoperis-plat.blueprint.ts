import type { BlueprintPricingRule, EstimateBlueprintConfig } from '../../estimate-blueprint-config.types';
import { baseConfig } from '../base';

function withQtyExplanations(rules: BlueprintPricingRule[]): BlueprintPricingRule[] {
  return rules.map((rule) => ({
    ...rule,
    explanation: {
      template: rule.wastePct
        ? `${rule.qtyKey}: {${rule.qtyKey}} ${rule.unit} + ${rule.wastePct}% pierderi × {unitPrice} MDL/${rule.unit}`
        : `${rule.qtyKey}: {${rule.qtyKey}} ${rule.unit} × {unitPrice} MDL/${rule.unit}`,
      variables: [rule.qtyKey],
    },
  }));
}

export const acoperisPlatBlueprint: EstimateBlueprintConfig = baseConfig({
  accessDifficultyImpact: { easy: 1.0, medium: 1.15, difficult: 1.3 },
  urgencyImpact: { urgent: 1.2, emergency: 1.5 },
  planPointTypes: [
    { type: 'drain', label: 'Sifon / scurgere', color: '#0ea5e9' },
    { type: 'chimney', label: 'Coș / ventilație', color: '#7c2d12' },
    { type: 'roof_plane', label: 'Suprafață acoperiș', color: '#f97316' },
  ],
  workModules: [
    {
      key: 'demolition',
      label: 'Demontare acoperiș vechi',
      helpText: 'Înlăturarea hidroizolației, izolației și straturilor existente.',
      defaultEnabled: false,
      stageCodes: ['demontare'],
      fieldKeys: ['oldRoofRemoval'],
      requiresQtyKeys: ['oldRoofRemovalArea'],
    },
    {
      key: 'vapor_barrier',
      label: 'Barieră de vapori',
      helpText: 'Strat de protecție împotriva umezelii din interior — obligatoriu sub izolație.',
      defaultEnabled: true,
      stageCodes: ['bariera_vapori'],
      fieldKeys: [],
    },
    {
      key: 'insulation',
      label: 'Izolație termică (XPS / PIR)',
      helpText: 'Plăci rigide de izolație peste bariera de vapori. Tipic: 10 cm XPS sau PIR.',
      defaultEnabled: true,
      stageCodes: ['izolare'],
      fieldKeys: ['insulationThicknessCm'],
    },
    {
      key: 'waterproofing',
      label: 'Hidroizolație (membrană)',
      helpText: 'Stratul principal etanș. Tipul (bitumen / TPO / PVC / EPDM) se alege în câmpul „Tip membrană”.',
      defaultEnabled: true,
      stageCodes: ['hidroizolare'],
      fieldKeys: ['waterproofingType'],
    },
    {
      key: 'drains',
      label: 'Sifoane (scurgere internă)',
      helpText: 'Sifoane prin placa de beton care colectează apa. Tipic: 1 sifon per 50-100 m².',
      defaultEnabled: true,
      stageCodes: ['sifoane'],
      fieldKeys: ['drainCount'],
      requiresQtyKeys: ['drainCount'],
    },
    {
      key: 'parapets',
      label: 'Atic (parapet perimetral)',
      helpText: 'Bordura ridicată în jurul acoperișului — finisare interior + capac metalic.',
      defaultEnabled: true,
      stageCodes: ['atic'],
      fieldKeys: ['parapetLengthM', 'parapetHeightM'],
      requiresQtyKeys: ['parapetLengthM'],
    },
    {
      key: 'terrace_finish',
      label: 'Finisare terasă (dale walkabile)',
      helpText: 'Dale pe pucnte de plastic peste membrană pentru zone walkabile. Activați doar pentru terase calc.',
      defaultEnabled: false,
      stageCodes: ['terasa'],
      fieldKeys: ['isTerrace', 'terraceArea'],
      requiresQtyKeys: ['terraceArea'],
    },
    {
      key: 'skylights_flat',
      label: 'Ferestre / lucarne plate',
      helpText: 'Unități de lumină pentru acoperișuri plate (Velux Flat / cupole).',
      defaultEnabled: false,
      stageCodes: ['lucarne_plate'],
      fieldKeys: ['skylightCount'],
      requiresQtyKeys: ['skylightCount'],
    },
    {
      key: 'ballast',
      label: 'Balast (pietriș / decor)',
      helpText: 'Pietriș 5-15 cm peste membrană — protecție UV și încărcare.',
      defaultEnabled: false,
      stageCodes: ['balast'],
      fieldKeys: ['ballastIncluded'],
      requiresQtyKeys: ['ballastArea'],
    },
  ],
  customFields: [
    {
      key: 'roofArea',
      label: 'Suprafață acoperiș',
      type: 'number',
      unit: 'm²',
      required: true,
      validation: { min: 5 },
      helpText: 'Suprafața plăcii de acoperiș (orizontală).',
      placeholder: 'ex. 120',
      section: 'General',
    },
    {
      key: 'waterproofingType',
      label: 'Tip membrană hidroizolație',
      type: 'select',
      options: ['bitumen_membrane', 'tpo', 'pvc', 'epdm'],
      required: false,
      defaultValue: 'bitumen_membrane',
      helpText: 'Bitumen — economic, durabilitate 15 ani. TPO/PVC — modern, 25+ ani. EPDM — cauciuc, 30+ ani, premium.',
      section: 'General',
    },
    {
      key: 'insulationThicknessCm',
      label: 'Grosime izolație (cm)',
      type: 'number',
      required: false,
      defaultValue: 10,
      validation: { min: 4, max: 40 },
      helpText: 'Standard pentru Moldova: 10-15 cm XPS/PIR.',
      section: 'General',
    },
    {
      key: 'drainCount',
      label: 'Număr sifoane',
      type: 'number',
      unit: 'buc',
      required: false,
      defaultValue: 0,
      helpText: 'Standard: 1 sifon per 50-100 m² de acoperiș.',
      section: 'General',
    },
    {
      key: 'parapetLengthM',
      label: 'Lungime atic / parapet',
      type: 'number',
      unit: 'm',
      required: false,
      defaultValue: 0,
      helpText: 'Lăsați 0 — se ia perimetrul clădirii. = perimetru acoperiș.',
      section: 'Avansat',
    },
    {
      key: 'parapetHeightM',
      label: 'Înălțime atic',
      type: 'number',
      unit: 'm',
      required: false,
      defaultValue: 0.5,
      validation: { min: 0, max: 3 },
      helpText: 'Înălțimea bordurii ridicate (tipic 0.3-0.8 m).',
      section: 'Avansat',
    },
    {
      key: 'oldRoofRemoval',
      label: 'Demontare acoperiș vechi',
      type: 'boolean',
      required: false,
      defaultValue: false,
      helpText: 'Bifați pentru reabilitări (refacere strat hidroizolant).',
      section: 'Avansat',
    },
    {
      key: 'isTerrace',
      label: 'Acoperișul este folosit ca terasă',
      type: 'boolean',
      required: false,
      defaultValue: false,
      helpText: 'Dacă DA — se montează dale walkabile + protecții suplimentare.',
      section: 'Avansat',
    },
    {
      key: 'terraceArea',
      label: 'Suprafață terasă',
      type: 'number',
      unit: 'm²',
      required: false,
      defaultValue: 0,
      helpText: 'Suprafața walkabilă. Lăsați 0 — se preia din suprafața acoperișului.',
      section: 'Avansat',
    },
    {
      key: 'skylightCount',
      label: 'Număr ferestre plate',
      type: 'number',
      unit: 'buc',
      required: false,
      defaultValue: 0,
      helpText: 'Cupole / ferestre Velux Flat.',
      section: 'Avansat',
    },
    {
      key: 'ballastIncluded',
      label: 'Strat de balast (pietriș)',
      type: 'boolean',
      required: false,
      defaultValue: false,
      helpText: 'Adaugă pietriș 5-15 cm peste membrană.',
      section: 'Avansat',
    },
  ],
  diagnosticQuestions: [],
  defaultStages: [
    { code: 'demontare', name: 'Demontare hidroizolație veche', kind: 'LABOR', defaultLaborHours: 8, durationDays: 2, checklist: ['Înlăturare straturi vechi', 'Evacuare moloz'], optional: true, moduleKey: 'demolition' },
    { code: 'bariera_vapori', name: 'Barieră de vapori', kind: 'MIXED', defaultLaborHours: 4, durationDays: 1, checklist: ['Curățare suport', 'Aplicare folie barieră', 'Etanșare îmbinări'], moduleKey: 'vapor_barrier' },
    { code: 'izolare', name: 'Izolație XPS / PIR', kind: 'MIXED', defaultLaborHours: 8, durationDays: 2, checklist: ['Lipire plăci izolante', 'Verificare planeitate'], moduleKey: 'insulation' },
    { code: 'hidroizolare', name: 'Hidroizolație (membrană)', kind: 'MIXED', defaultLaborHours: 16, durationDays: 3, checklist: ['Sudare/lipire membrană', 'Etanșare suprapuneri', 'Verificare etanșeitate'], moduleKey: 'waterproofing' },
    { code: 'sifoane', name: 'Sifoane scurgere', kind: 'MIXED', defaultLaborHours: 6, durationDays: 1, checklist: ['Decupare deck', 'Montaj sifon', 'Etanșare membrană în jurul sifonului'], moduleKey: 'drains' },
    { code: 'atic', name: 'Atic / parapet', kind: 'MIXED', defaultLaborHours: 10, durationDays: 2, checklist: ['Hidroizolație față interior atic', 'Montaj capac metalic', 'Etanșare colțuri'], moduleKey: 'parapets' },
    { code: 'terasa', name: 'Finisare terasă (dale)', kind: 'MIXED', defaultLaborHours: 12, durationDays: 2, checklist: ['Montaj puncte de plastic', 'Plasare dale', 'Aliniere'], optional: true, moduleKey: 'terrace_finish' },
    { code: 'lucarne_plate', name: 'Ferestre plate', kind: 'MIXED', defaultLaborHours: 5, durationDays: 1, checklist: ['Decupare deck', 'Montaj cupolă/Velux Flat', 'Etanșare'], optional: true, moduleKey: 'skylights_flat' },
    { code: 'balast', name: 'Strat balast', kind: 'MIXED', defaultLaborHours: 4, durationDays: 1, checklist: ['Transport pietriș', 'Aplicare uniform', 'Nivelare'], optional: true, moduleKey: 'ballast' },
    { code: 'verificare', name: 'Test de etanșeitate & predare', kind: 'LABOR', defaultLaborHours: 4, durationDays: 1, checklist: ['Test cu apă', 'Predare client'], moduleKey: 'waterproofing' },
  ],
  pricingRules: withQtyExplanations([
    // Demolition
    { stageCode: 'demontare', description: 'Demontare hidroizolație & izolație veche', unit: 'm²', qtyKey: 'oldRoofRemovalArea', unitPrice: 38, kind: 'labor', moduleKey: 'demolition', enabledWhen: { anyQtyKeys: ['oldRoofRemovalArea'] } },
    { stageCode: 'demontare', description: 'Evacuare moloz', unit: 'm²', qtyKey: 'oldRoofRemovalArea', unitPrice: 14, kind: 'material', moduleKey: 'demolition', enabledWhen: { anyQtyKeys: ['oldRoofRemovalArea'] } },

    // Vapor barrier
    { stageCode: 'bariera_vapori', description: 'Folie barieră de vapori', unit: 'm²', qtyKey: 'vaporBarrierArea', unitPrice: 28, wastePct: 8, kind: 'material', moduleKey: 'vapor_barrier' },
    { stageCode: 'bariera_vapori', description: 'Lucrări aplicare barieră', unit: 'm²', qtyKey: 'vaporBarrierArea', unitPrice: 30, kind: 'labor', moduleKey: 'vapor_barrier' },

    // Insulation (XPS/PIR boards)
    { stageCode: 'izolare', description: 'Plăci izolație XPS/PIR', unit: 'm³', qtyKey: 'insulationVolumeM3', unitPrice: 1850, wastePct: 5, kind: 'material', moduleKey: 'insulation' },
    { stageCode: 'izolare', description: 'Lucrări montaj izolație', unit: 'm²', qtyKey: 'insulationArea', unitPrice: 60, kind: 'labor', moduleKey: 'insulation' },

    // Waterproofing — one type fires at a time, based on membrane qty key
    { stageCode: 'hidroizolare', description: 'Membrană bituminoasă', unit: 'm²', qtyKey: 'membraneAreaBitumen', unitPrice: 75, wastePct: 12, kind: 'material', moduleKey: 'waterproofing', enabledWhen: { anyQtyKeys: ['membraneAreaBitumen'] } },
    { stageCode: 'hidroizolare', description: 'Lucrări montaj membrană bituminoasă', unit: 'm²', qtyKey: 'membraneAreaBitumen', unitPrice: 60, kind: 'labor', moduleKey: 'waterproofing', enabledWhen: { anyQtyKeys: ['membraneAreaBitumen'] } },
    { stageCode: 'hidroizolare', description: 'Membrană TPO', unit: 'm²', qtyKey: 'membraneAreaTpo', unitPrice: 180, wastePct: 10, kind: 'material', moduleKey: 'waterproofing', enabledWhen: { anyQtyKeys: ['membraneAreaTpo'] } },
    { stageCode: 'hidroizolare', description: 'Lucrări sudare TPO', unit: 'm²', qtyKey: 'membraneAreaTpo', unitPrice: 90, kind: 'labor', moduleKey: 'waterproofing', enabledWhen: { anyQtyKeys: ['membraneAreaTpo'] } },
    { stageCode: 'hidroizolare', description: 'Membrană PVC', unit: 'm²', qtyKey: 'membraneAreaPvc', unitPrice: 165, wastePct: 10, kind: 'material', moduleKey: 'waterproofing', enabledWhen: { anyQtyKeys: ['membraneAreaPvc'] } },
    { stageCode: 'hidroizolare', description: 'Lucrări sudare PVC', unit: 'm²', qtyKey: 'membraneAreaPvc', unitPrice: 90, kind: 'labor', moduleKey: 'waterproofing', enabledWhen: { anyQtyKeys: ['membraneAreaPvc'] } },
    { stageCode: 'hidroizolare', description: 'Membrană EPDM (cauciuc)', unit: 'm²', qtyKey: 'membraneAreaEpdm', unitPrice: 145, wastePct: 8, kind: 'material', moduleKey: 'waterproofing', enabledWhen: { anyQtyKeys: ['membraneAreaEpdm'] } },
    { stageCode: 'hidroizolare', description: 'Lucrări montaj EPDM', unit: 'm²', qtyKey: 'membraneAreaEpdm', unitPrice: 95, kind: 'labor', moduleKey: 'waterproofing', enabledWhen: { anyQtyKeys: ['membraneAreaEpdm'] } },

    // Drains
    { stageCode: 'sifoane', description: 'Sifon scurgere internă (set complet)', unit: 'buc', qtyKey: 'drainCount', unitPrice: 850, kind: 'material', moduleKey: 'drains', enabledWhen: { anyQtyKeys: ['drainCount'] } },
    { stageCode: 'sifoane', description: 'Lucrări montaj sifon', unit: 'buc', qtyKey: 'drainCount', unitPrice: 480, kind: 'labor', moduleKey: 'drains', enabledWhen: { anyQtyKeys: ['drainCount'] } },

    // Parapets
    { stageCode: 'atic', description: 'Capac metalic atic', unit: 'm', qtyKey: 'parapetLengthM', unitPrice: 95, wastePct: 5, kind: 'material', moduleKey: 'parapets', enabledWhen: { anyQtyKeys: ['parapetLengthM'] } },
    { stageCode: 'atic', description: 'Hidroizolație față interior atic', unit: 'm²', qtyKey: 'parapetFaceArea', unitPrice: 65, kind: 'material', moduleKey: 'parapets', enabledWhen: { anyQtyKeys: ['parapetFaceArea'] } },
    { stageCode: 'atic', description: 'Lucrări montaj atic', unit: 'm', qtyKey: 'parapetLengthM', unitPrice: 75, kind: 'labor', moduleKey: 'parapets', enabledWhen: { anyQtyKeys: ['parapetLengthM'] } },

    // Terrace pavers
    { stageCode: 'terasa', description: 'Dale terasă (material)', unit: 'm²', qtyKey: 'terraceArea', unitPrice: 145, wastePct: 8, kind: 'material', moduleKey: 'terrace_finish', enabledWhen: { moduleEnabled: 'terrace_finish', anyQtyKeys: ['terraceArea'] } },
    { stageCode: 'terasa', description: 'Puncte de plastic (suporți dale)', unit: 'm²', qtyKey: 'terraceArea', unitPrice: 38, kind: 'material', moduleKey: 'terrace_finish', enabledWhen: { moduleEnabled: 'terrace_finish', anyQtyKeys: ['terraceArea'] } },
    { stageCode: 'terasa', description: 'Lucrări montaj dale', unit: 'm²', qtyKey: 'terraceArea', unitPrice: 85, kind: 'labor', moduleKey: 'terrace_finish', enabledWhen: { moduleEnabled: 'terrace_finish', anyQtyKeys: ['terraceArea'] } },

    // Skylights flat
    { stageCode: 'lucarne_plate', description: 'Velux Flat / cupolă (per bucată)', unit: 'buc', qtyKey: 'skylightCount', unitPrice: 4500, kind: 'material', moduleKey: 'skylights_flat', enabledWhen: { moduleEnabled: 'skylights_flat', anyQtyKeys: ['skylightCount'] } },
    { stageCode: 'lucarne_plate', description: 'Lucrări montaj Velux Flat', unit: 'buc', qtyKey: 'skylightCount', unitPrice: 1800, kind: 'labor', moduleKey: 'skylights_flat', enabledWhen: { moduleEnabled: 'skylights_flat', anyQtyKeys: ['skylightCount'] } },

    // Ballast
    { stageCode: 'balast', description: 'Pietriș rotund (material)', unit: 'm²', qtyKey: 'ballastArea', unitPrice: 28, kind: 'material', moduleKey: 'ballast', enabledWhen: { moduleEnabled: 'ballast', anyQtyKeys: ['ballastArea'] } },
    { stageCode: 'balast', description: 'Lucrări aplicare balast', unit: 'm²', qtyKey: 'ballastArea', unitPrice: 18, kind: 'labor', moduleKey: 'ballast', enabledWhen: { moduleEnabled: 'ballast', anyQtyKeys: ['ballastArea'] } },

    // Acceptance
    { stageCode: 'verificare', description: 'Test de etanșeitate cu apă', unit: 'm²', qtyKey: 'roofArea', unitPrice: 10, kind: 'labor', moduleKey: 'waterproofing' },
  ]),
});
