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
    defaultLaborRate: 185,
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
      { stageCode: 'tablou', description: 'Tablou electric (material)', unit: 'buc', qtyKey: 'panelCount', unitPrice: 1800, kind: 'material' },
    ],
  }),
  clima: baseConfig({
    planPointTypes: [
      { type: 'indoor', label: 'Unitate interior (Split)', color: '#0ea5e9' },
      { type: 'outdoor', label: 'Unitate exterior', color: '#0284c7' },
      { type: 'route', label: 'Traseu frigorific', color: '#38bdf8' },
    ],
    diagnosticQuestions: [
      { key: 'acUnits', label: 'Număr unități split', type: 'number' },
      { key: 'routeLengthM', label: 'Lungime traseu (m)', type: 'number' },
    ],
    defaultStages: [
      { code: 'traseu', name: 'Pregătire traseu freon', kind: 'MIXED', defaultLaborHours: 4, durationDays: 1, checklist: ['Găurire perete exterior', 'Instalare tub drenaj'] },
      { code: 'montaj', name: 'Instalare echipamente', kind: 'MIXED', defaultLaborHours: 6, durationDays: 1, checklist: ['Fixare split interior', 'Instalare suport exterior'] },
      { code: 'testare', name: 'Vacuum & Testare', kind: 'LABOR', defaultLaborHours: 2, durationDays: 1, checklist: ['Verificare vacuum', 'Test scurgeri agent', 'Măsurare temperatură'] },
    ],
    pricingRules: [
      { stageCode: 'montaj', description: 'Manoperă instalare split AC', unit: 'buc', qtyKey: 'acUnits', unitPrice: 1200, kind: 'labor' },
      { stageCode: 'traseu', description: 'Traseu freon izolat + cablu', unit: 'm', qtyKey: 'routeLengthM', unitPrice: 140, kind: 'material' },
      { stageCode: 'traseu', description: 'Manoperă montaj traseu', unit: 'm', qtyKey: 'routeLengthM', unitPrice: 80, kind: 'labor' },
    ],
  }),
  'lucrari-finisaj': baseConfig({
    planPointTypes: [
      { type: 'wall', label: 'Perete', color: '#c084fc' },
      { type: 'ceiling', label: 'Tavan', color: '#e879f9' },
      { type: 'floor', label: 'Pardoseală', color: '#fb7185' },
      { type: 'door', label: 'Ușă', color: '#f43f5e' },
    ],
    diagnosticQuestions: [
      { key: 'finishArea', label: 'Suprafață finisaj (m²)', type: 'number' },
      { key: 'wallHeight', label: 'Înălțime camere (m)', type: 'number' },
    ],
    defaultStages: [
      { code: 'pregatire', name: 'Pregătire suprafețe', kind: 'LABOR', defaultLaborHours: 5, durationDays: 1, checklist: ['Curățare strat suport', 'Aplicare amorsă'] },
      { code: 'glet', name: 'Aplicare glet / tencuială', kind: 'MIXED', defaultLaborHours: 12, durationDays: 3, checklist: ['Primul strat glet gros', 'Slefuire grosieră', 'Strat finisaj superfin'] },
      { code: 'vopsea', name: 'Vopsire decorativă / tapet', kind: 'MIXED', defaultLaborHours: 8, durationDays: 2, checklist: ['Protecție plinte & uși', 'Vopsire strat 1', 'Vopsire strat 2'] },
    ],
    pricingRules: [
      { stageCode: 'glet', description: 'Glet de încărcare (material)', unit: 'sac', qtyKey: 'finishArea', unitPrice: 160, wastePct: 15, kind: 'material' },
      { stageCode: 'glet', description: 'Manoperă gletuire tencuială', unit: 'm²', qtyKey: 'finishArea', unitPrice: 120, kind: 'labor' },
      { stageCode: 'vopsea', description: 'Vopsea lavabilă premium', unit: 'l', qtyKey: 'finishArea', unitPrice: 90, kind: 'material' },
      { stageCode: 'vopsea', description: 'Manoperă vopsire lavabilă', unit: 'm²', qtyKey: 'finishArea', unitPrice: 45, kind: 'labor' },
    ],
  }),
  acoperis: baseConfig({
    planPointTypes: [
      { type: 'roof_plane', label: 'Suprafață acoperiș', color: '#f97316' },
      { type: 'chimney', label: 'Coș de fum', color: '#7c2d12' },
      { type: 'gutter', label: 'Jgheaburi & scurgeri', color: '#fed7aa' },
    ],
    diagnosticQuestions: [
      { key: 'roofArea', label: 'Suprafață acoperiș (m²)', type: 'number' },
      { key: 'gutterLengthM', label: 'Lungime jgheaburi (m)', type: 'number' },
    ],
    defaultStages: [
      { code: 'structura', name: 'Structură căprior & astereală', kind: 'MIXED', defaultLaborHours: 16, durationDays: 4, checklist: ['Montaj căpriori', 'Tratament antiseptic lemn', 'Montaj astereală'] },
      { code: 'membrana', name: 'Membrană & Folie anticondens', kind: 'MIXED', defaultLaborHours: 8, durationDays: 2, checklist: ['Montaj folie', 'Fixare rigle contra-șipci'] },
      { code: 'invelitoare', name: 'Montaj țiglă / tablă', kind: 'MIXED', defaultLaborHours: 20, durationDays: 5, checklist: ['Montaj tablă metalică/țiglă', 'Instalare coame', 'Etanșare dolii'] },
      { code: 'scurgere', name: 'Montaj jgheaburi & burlane', kind: 'MIXED', defaultLaborHours: 6, durationDays: 1, checklist: ['Instalare cârlige', 'Aliniere pantă jgheab', 'Montaj burlane scurgere'] },
    ],
    pricingRules: [
      { stageCode: 'structura', description: 'Cherestea structură lemn', unit: 'm³', qtyKey: 'roofArea', unitPrice: 4800, kind: 'material' },
      { stageCode: 'structura', description: 'Manoperă structură căpriori', unit: 'm²', qtyKey: 'roofArea', unitPrice: 190, kind: 'labor' },
      { stageCode: 'invelitoare', description: 'Tablă metalică tiglă', unit: 'm²', qtyKey: 'roofArea', unitPrice: 240, wastePct: 15, kind: 'material' },
      { stageCode: 'invelitoare', description: 'Manoperă montaj învelitoare', unit: 'm²', qtyKey: 'roofArea', unitPrice: 140, kind: 'labor' },
    ],
  }),
  fatade: baseConfig({
    planPointTypes: [
      { type: 'wall_facade', label: 'Perete fațadă', color: '#ea580c' },
      { type: 'window_slope', label: 'Glaf ferestre', color: '#c2410c' },
      { type: 'scaffolding', label: 'Schelă fațadă', color: '#9a3412' },
    ],
    diagnosticQuestions: [
      { key: 'facadeArea', label: 'Suprafață fațadă (m²)', type: 'number' },
      { key: 'scaffoldingArea', label: 'Suprafață schelă (m²)', type: 'number' },
    ],
    defaultStages: [
      { code: 'schela', name: 'Montaj schelă metalică', kind: 'LABOR', defaultLaborHours: 6, durationDays: 1, checklist: ['Instalare baze schelă', 'Ancorare în pereți', 'Plase protecție'] },
      { code: 'izolatie', name: 'Lipire polistiren / vată', kind: 'MIXED', defaultLaborHours: 18, durationDays: 4, checklist: ['Aplicare adeziv', 'Lipire plăci', 'Dibluire mecanică'] },
      { code: 'armare', name: 'Masă șpaclu & plasă', kind: 'MIXED', defaultLaborHours: 12, durationDays: 3, checklist: ['Montaj colțare', 'Aplicare masă șpaclu', 'Înglobare plasă fibră'] },
      { code: 'decorativa', name: 'Tencuială decorativă', kind: 'MIXED', defaultLaborHours: 10, durationDays: 2, checklist: ['Aplicare grund fațadă', 'Tencuială decorativă structurată'] },
    ],
    pricingRules: [
      { stageCode: 'izolatie', description: 'Vată bazaltică fațadă 10cm', unit: 'm²', qtyKey: 'facadeArea', unitPrice: 210, wastePct: 5, kind: 'material' },
      { stageCode: 'izolatie', description: 'Manoperă montaj izolație', unit: 'm²', qtyKey: 'facadeArea', unitPrice: 130, kind: 'labor' },
      { stageCode: 'decorativa', description: 'Tencuială decorativă sac/găleată', unit: 'buc', qtyKey: 'facadeArea', unitPrice: 380, kind: 'material' },
      { stageCode: 'decorativa', description: 'Manoperă tencuială decorativă', unit: 'm²', qtyKey: 'facadeArea', unitPrice: 90, kind: 'labor' },
    ],
  }),
  'okna-dveri': baseConfig({
    planPointTypes: [
      { type: 'window', label: 'Fereastră', color: '#2563eb' },
      { type: 'door', label: 'Ușă exterioară', color: '#1d4ed8' },
      { type: 'sliding_door', label: 'Ușă culisantă', color: '#1e3a8a' },
    ],
    diagnosticQuestions: [
      { key: 'windowCount', label: 'Număr ferestre', type: 'number' },
      { key: 'doorCount', label: 'Număr uși exterioare', type: 'number' },
    ],
    defaultStages: [
      { code: 'pregatire', name: 'Demontare tâmplărie veche', kind: 'LABOR', defaultLaborHours: 3, durationDays: 1, checklist: ['Demontare cercuri ferestre', 'Curățare goluri zidărie'] },
      { code: 'montaj', name: 'Montaj tâmplărie nouă', kind: 'MIXED', defaultLaborHours: 8, durationDays: 2, checklist: ['Fixare mecanică cadre', 'Verificare laser planeitate', 'Etanșare cu spumă PU'] },
      { code: 'reglaj', name: 'Reglaj accesorii & glafuri', kind: 'MIXED', defaultLaborHours: 4, durationDays: 1, checklist: ['Montaj geamuri termopan', 'Reglaj feronerie', 'Montaj glaf exterior/interior'] },
    ],
    pricingRules: [
      { stageCode: 'montaj', description: 'Manoperă montaj fereastră standard', unit: 'buc', qtyKey: 'windowCount', unitPrice: 380, kind: 'labor' },
      { stageCode: 'montaj', description: 'Manoperă montaj ușă metalică', unit: 'buc', qtyKey: 'doorCount', unitPrice: 750, kind: 'labor' },
      { stageCode: 'reglaj', description: 'Spumă montaj profesională', unit: 'tub', qtyKey: 'windowCount', unitPrice: 85, kind: 'material' },
    ],
  }),
  mobila: baseConfig({
    planPointTypes: [
      { type: 'kitchen_cabinet', label: 'Corp bucătărie', color: '#14b8a6' },
      { type: 'wardrobe', label: 'Dulap dressing', color: '#0f766e' },
      { type: 'bed', label: 'Pat dormitor', color: '#115e59' },
      { type: 'table', label: 'Masă / Birou', color: '#134e4a' },
    ],
    diagnosticQuestions: [
      { key: 'cabinetCount', label: 'Număr corpuri mobilier', type: 'number' },
      { key: 'wardrobeCount', label: 'Număr dulapuri mari', type: 'number' },
    ],
    defaultStages: [
      { code: 'debitare', name: 'Pregătire & debitare PAL/MDF', kind: 'MIXED', defaultLaborHours: 8, durationDays: 2, checklist: ['Optimizare debitare plăci', 'Cătuire canturi', 'Pregătire găuri euroșuruburi'] },
      { code: 'asamblare', name: 'Asamblare structură corpuri', kind: 'MIXED', defaultLaborHours: 12, durationDays: 3, checklist: ['Montaj picioare & glisiere', 'Asamblare carcase', 'Prindere corpuri suspendate'] },
      { code: 'instalare', name: 'Instalare fațade & reglaj', kind: 'MIXED', defaultLaborHours: 6, durationDays: 1, checklist: ['Prindere balamale fațade', 'Montaj mânere & accesorii', 'Aliniere uși & sertare'] },
    ],
    pricingRules: [
      { stageCode: 'debitare', description: 'Plăci PAL/MDF debitați', unit: 'm²', qtyKey: 'cabinetCount', unitPrice: 420, kind: 'material' },
      { stageCode: 'asamblare', description: 'Manoperă asamblare corp mobilier', unit: 'buc', qtyKey: 'cabinetCount', unitPrice: 350, kind: 'labor' },
      { stageCode: 'asamblare', description: 'Balamale cu amortizor', unit: 'set', qtyKey: 'cabinetCount', unitPrice: 75, kind: 'material' },
      { stageCode: 'instalare', description: 'Manoperă montaj dulap dressing', unit: 'buc', qtyKey: 'wardrobeCount', unitPrice: 950, kind: 'labor' },
    ],
  }),
  cleaning: baseConfig({
    planPointTypes: [
      { type: 'room', label: 'Cameră', color: '#22c55e' },
      { type: 'window_clean', label: 'Geamuri', color: '#15803d' },
      { type: 'deep_clean', label: 'Curățare profundă', color: '#166534' },
    ],
    diagnosticQuestions: [
      { key: 'cleanArea', label: 'Suprafață totală (m²)', type: 'number' },
      { key: 'windowCount', label: 'Număr geamuri', type: 'number' },
    ],
    defaultStages: [
      { code: 'aspirare', name: 'Curățare uscată & desprăfuire', kind: 'LABOR', defaultLaborHours: 3, durationDays: 1, checklist: ['Aspirare tavane & pereți', 'Desprăfuire mobilier', 'Aspirare pardoseală & covoare'] },
      { code: 'spalare', name: 'Curățare umedă & igienizare', kind: 'MIXED', defaultLaborHours: 5, durationDays: 1, checklist: ['Igienizare grupuri sanitare', 'Degresare blat bucătărie', 'Spălare pardoseli dure'] },
      { code: 'geamuri', name: 'Spălare geamuri & fațade', kind: 'LABOR', defaultLaborHours: 3, durationDays: 1, checklist: ['Curățare rame geam', 'Spălare sticle interior/exterior'] },
    ],
    pricingRules: [
      { stageCode: 'spalare', description: 'Detergenți & consumabile', unit: 'buc', qtyKey: 'cleanArea', unitPrice: 6, kind: 'material' },
      { stageCode: 'spalare', description: 'Manoperă curățenie standard', unit: 'm²', qtyKey: 'cleanArea', unitPrice: 30, kind: 'labor' },
      { stageCode: 'geamuri', description: 'Manoperă spălare geam', unit: 'buc', qtyKey: 'windowCount', unitPrice: 50, kind: 'labor' },
    ],
  }),
  'it-networks': baseConfig({
    planPointTypes: [
      { type: 'ethernet', label: 'Port RJ45 / Ethernet', color: '#6366f1' },
      { type: 'ap', label: 'Wi-Fi AP (Access Point)', color: '#4338ca' },
      { type: 'camera', label: 'Cameră IP dome', color: '#3730a3' },
      { type: 'rack', label: 'Cabinet Rack IT', color: '#312e81' },
    ],
    diagnosticQuestions: [
      { key: 'networkPoints', label: 'Număr porturi rețea', type: 'number' },
      { key: 'apCount', label: 'Număr Access Points', type: 'number' },
      { key: 'cameraCount', label: 'Număr camere IP supraveghere', type: 'number' },
    ],
    defaultStages: [
      { code: 'cablare', name: 'Cablare structurată Cat6', kind: 'MIXED', defaultLaborHours: 8, durationDays: 2, checklist: ['Tragere cabluri UTP prin tuburi', 'Montaj prize RJ45 în doze', 'Sertizare în patchpanel'] },
      { code: 'montaj', name: 'Montaj echipamente rețea', kind: 'MIXED', defaultLaborHours: 6, durationDays: 1, checklist: ['Montaj cabinet Rack pe perete', 'Fixare Switch & Router', 'Instalare AP-uri & camere IP'] },
      { code: 'configurare', name: 'Configurare rețea & teste', kind: 'LABOR', defaultLaborHours: 4, durationDays: 1, checklist: ['Configurare VLAN-uri & Wi-Fi', 'Testare cabluri cu Fluke Tester', 'Predare credențiale rețea'] },
    ],
    pricingRules: [
      { stageCode: 'cablare', description: 'Cablu UTP Cat6 LSOH', unit: 'm', qtyKey: 'networkPoints', unitPrice: 15, wastePct: 20, kind: 'material' },
      { stageCode: 'cablare', description: 'Manoperă cablare rețea (per port)', unit: 'buc', qtyKey: 'networkPoints', unitPrice: 110, kind: 'labor' },
      { stageCode: 'montaj', description: 'Manoperă instalare AP Wi-Fi', unit: 'buc', qtyKey: 'apCount', unitPrice: 280, kind: 'labor' },
      { stageCode: 'montaj', description: 'Manoperă montaj cameră IP dome', unit: 'buc', qtyKey: 'cameraCount', unitPrice: 380, kind: 'labor' },
    ],
  }),
  'panouri-solare': baseConfig({
    planPointTypes: [
      { type: 'solar_panel', label: 'Panou solar fotovoltaic', color: '#10b981' },
      { type: 'inverter', label: 'Invertor hibrid', color: '#047857' },
      { type: 'battery', label: 'Acumulator baterii', color: '#065f46' },
      { type: 'meter', label: 'Contor bidirecțional', color: '#064e3b' },
    ],
    diagnosticQuestions: [
      { key: 'panelCount', label: 'Număr panouri solare', type: 'number' },
      { key: 'batteryCapacity', label: 'Capacitate acumulator (kWh)', type: 'number' },
    ],
    defaultStages: [
      { code: 'suport', name: 'Instalare structură suport', kind: 'MIXED', defaultLaborHours: 8, durationDays: 2, checklist: ['Montaj profile aluminiu pe acoperiș', 'Aliniere profile & etanșare puncte fixare'] },
      { code: 'panouri', name: 'Montaj panouri & cablare', kind: 'MIXED', defaultLaborHours: 12, durationDays: 2, checklist: ['Fixare panouri fotovoltaice', 'Traseu cablu solar DC', 'Montaj tablouri protecție DC/AC'] },
      { code: 'invertor', name: 'Montaj invertor & acumulator', kind: 'MIXED', defaultLaborHours: 8, durationDays: 1, checklist: ['Montaj invertor pe perete', 'Configurare conexiune baterii', 'Teste punere în funcțiune'] },
    ],
    pricingRules: [
      { stageCode: 'suport', description: 'Structură fixare acoperiș țiglă/tablă', unit: 'buc', qtyKey: 'panelCount', unitPrice: 450, kind: 'material' },
      { stageCode: 'panouri', description: 'Manoperă fixare panou fotovoltaic', unit: 'buc', qtyKey: 'panelCount', unitPrice: 350, kind: 'labor' },
      { stageCode: 'invertor', description: 'Manoperă instalare invertor hibrid', unit: 'buc', qtyKey: 'panelCount', unitPrice: 2200, kind: 'labor' },
      { stageCode: 'invertor', description: 'Baterii Litiu LiFePO4 (stocare)', unit: 'kWh', qtyKey: 'batteryCapacity', unitPrice: 7500, kind: 'material' },
    ],
  }),
  constructii: baseConfig({
    planPointTypes: [
      { type: 'foundation', label: 'Fundație beton', color: '#4b5563' },
      { type: 'brick_wall', label: 'Zidărie cărămidă', color: '#991b1b' },
      { type: 'slab', label: 'Placă beton armat', color: '#374151' },
      { type: 'column', label: 'Stâlp susținere', color: '#1f2937' },
    ],
    diagnosticQuestions: [
      { key: 'builtArea', label: 'Suprafață construită (m²)', type: 'number' },
      { key: 'storyCount', label: 'Număr niveluri clădire', type: 'number' },
    ],
    defaultStages: [
      { code: 'fundatie', name: 'Săpătură & Turnare fundație', kind: 'MIXED', defaultLaborHours: 24, durationDays: 5, checklist: ['Săpătură șanțuri conform proiect', 'Cofrare & montaj armătură oțel', 'Turnare beton turnat auto'] },
      { code: 'structura', name: 'Zidărie & Stâlpi susținere', kind: 'MIXED', defaultLaborHours: 32, durationDays: 8, checklist: ['Montaj armătură stâlpi rezistență', 'Zidire pereți din cărămidă/BCA', 'Cofrare & turnare stâlpi beton'] },
      { code: 'placa', name: 'Cofrare & Turnare placă', kind: 'MIXED', defaultLaborHours: 16, durationDays: 4, checklist: ['Montaj grinzi & popi susținere', 'Armare rețea oțel placă', 'Turnare placă peste parter/etaj'] },
    ],
    pricingRules: [
      { stageCode: 'fundatie', description: 'Beton armat B250 (fundație)', unit: 'm³', qtyKey: 'builtArea', unitPrice: 1650, kind: 'material' },
      { stageCode: 'fundatie', description: 'Manoperă cofrare armare fundație', unit: 'm²', qtyKey: 'builtArea', unitPrice: 280, kind: 'labor' },
      { stageCode: 'structura', description: 'Cărămidă porotherm zidărie', unit: 'buc', qtyKey: 'builtArea', unitPrice: 8, kind: 'material' },
      { stageCode: 'structura', description: 'Manoperă zidărie pereți structurali', unit: 'm³', qtyKey: 'builtArea', unitPrice: 480, kind: 'labor' },
    ],
  }),
  pavaj: baseConfig({
    planPointTypes: [
      { type: 'pavement_area', label: 'Zonă pavaj', color: '#6b7280' },
      { type: 'border', label: 'Bordură limitare', color: '#374151' },
      { type: 'drainage', label: 'Rigolă evacuare apă', color: '#1f2937' },
    ],
    diagnosticQuestions: [
      { key: 'pavementArea', label: 'Suprafață pavat (m²)', type: 'number' },
      { key: 'borderLengthM', label: 'Lungime borduri (m)', type: 'number' },
    ],
    defaultStages: [
      { code: 'sapaturi', name: 'Decopertare & pregătire teren', kind: 'LABOR', defaultLaborHours: 8, durationDays: 2, checklist: ['Decopertare strat fertil pământ 25cm', 'Nivelare & compactare sol suport'] },
      { code: 'suport', name: 'Strat suport din piatră & nisip', kind: 'MIXED', defaultLaborHours: 10, durationDays: 2, checklist: ['Așternere geotextil de separare', 'Strat refuz ciur / balast compactat', 'Strat nivelare din nisip fin'] },
      { code: 'montaj', name: 'Montaj pavele & compactare finală', kind: 'MIXED', defaultLaborHours: 16, durationDays: 3, checklist: ['Așezare pavele model stabilit', 'Umplere rosturi cu nisip cuarțos', 'Compactare finală cu placă vibratoare'] },
      { code: 'borduri', name: 'Montaj borduri & rigole scurgere', kind: 'MIXED', defaultLaborHours: 6, durationDays: 1, checklist: ['Montaj borduri pe pat beton', 'Instalare rigole preluare ape pluviale'] },
    ],
    pricingRules: [
      { stageCode: 'sapaturi', description: 'Manoperă decopertare mecanică/manuală', unit: 'm²', qtyKey: 'pavementArea', unitPrice: 45, kind: 'labor' },
      { stageCode: 'montaj', description: 'Pavele vibropresate grosime 6cm', unit: 'm²', qtyKey: 'pavementArea', unitPrice: 195, wastePct: 8, kind: 'material' },
      { stageCode: 'montaj', description: 'Manoperă montaj pavele vibropresate', unit: 'm²', qtyKey: 'pavementArea', unitPrice: 110, kind: 'labor' },
      { stageCode: 'borduri', description: 'Bordură carosabilă/pietonală (material)', unit: 'm', qtyKey: 'borderLengthM', unitPrice: 40, kind: 'material' },
      { stageCode: 'borduri', description: 'Manoperă montaj borduri pe pat beton', unit: 'm', qtyKey: 'borderLengthM', unitPrice: 65, kind: 'labor' },
    ],
  }),
};

function genericBlueprint(categoryName: string, slug: string): EstimateBlueprintConfig {
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
      { stageCode: 'executie', description: `Manoperă ${categoryName}`, unit: 'ore', qtyKey: 'laborHours', unitPrice: 195, kind: 'labor' },
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
