/**
 * Registry of company-configurable pricing-modifier percentages.
 *
 * Each entry is a "+X% surcharge" knob that used to be hard-coded inside a
 * category measurement util (e.g. finishLevel premium = +15%). A company may
 * override the percentage; the registry value is the default/fallback.
 *
 * Single source of truth for: (a) backend defaults, (b) the settings UI catalog,
 * (c) validation of incoming override keys. Frontend preview mirrors keep their
 * own literal fallbacks and only apply the sparse company overrides on top.
 */

export type PricingModifierDef = {
  /** Stable key, e.g. 'finishing.finishLevel.premium'. */
  key: string;
  categorySlug: string;
  /** UI sub-group within the category (usually the driving field). */
  group: string;
  label: { ro: string; ru: string };
  /** Default surcharge percent (premium = 15 → ×1.15). */
  defaultPct: number;
};

export const PRICING_MODIFIERS: readonly PricingModifierDef[] = [
  // ---- lucrari-finisaj ----
  { key: 'finishing.surfaceCondition.old', categorySlug: 'lucrari-finisaj', group: 'Stare suprafață', label: { ro: 'Suprafață veche', ru: 'Старая поверхность' }, defaultPct: 15 },
  { key: 'finishing.surfaceCondition.very_bad', categorySlug: 'lucrari-finisaj', group: 'Stare suprafață', label: { ro: 'Suprafață foarte deteriorată', ru: 'Сильно повреждённая поверхность' }, defaultPct: 35 },
  { key: 'finishing.finishLevel.premium', categorySlug: 'lucrari-finisaj', group: 'Nivel finisaj', label: { ro: 'Finisaj premium', ru: 'Премиум-отделка' }, defaultPct: 15 },

  // ---- panouri-solare ----
  { key: 'solar.roofType.tile', categorySlug: 'panouri-solare', group: 'Tip acoperiș', label: { ro: 'Acoperiș din țiglă', ru: 'Черепичная крыша' }, defaultPct: 15 },
  { key: 'solar.roofType.flat', categorySlug: 'panouri-solare', group: 'Tip acoperiș', label: { ro: 'Acoperiș plat / terasă', ru: 'Плоская крыша / терраса' }, defaultPct: 25 },
  { key: 'solar.roofType.ground', categorySlug: 'panouri-solare', group: 'Tip acoperiș', label: { ro: 'Montaj la sol', ru: 'Наземный монтаж' }, defaultPct: 35 },

  // ---- okna-dveri ----
  { key: 'okna.installationType.warm_installation', categorySlug: 'okna-dveri', group: 'Tip montaj', label: { ro: 'Montaj termic (benzi)', ru: 'Тёплый монтаж' }, defaultPct: 35 },
  { key: 'okna.installationType.renovation', categorySlug: 'okna-dveri', group: 'Tip montaj', label: { ro: 'Montaj în renovare', ru: 'Монтаж в реновации' }, defaultPct: 20 },

  // ---- pavaj ----
  { key: 'pavaj.vehicleLoad.car', categorySlug: 'pavaj', group: 'Trafic', label: { ro: 'Trafic auto ușor', ru: 'Лёгкий авто-трафик' }, defaultPct: 15 },
  { key: 'pavaj.vehicleLoad.heavy', categorySlug: 'pavaj', group: 'Trafic', label: { ro: 'Trafic greu / camioane', ru: 'Тяжёлый трафик / грузовики' }, defaultPct: 35 },
  { key: 'pavaj.patternComplexity.mixed', categorySlug: 'pavaj', group: 'Model', label: { ro: 'Model mixt', ru: 'Смешанный узор' }, defaultPct: 15 },
  { key: 'pavaj.patternComplexity.decorative', categorySlug: 'pavaj', group: 'Model', label: { ro: 'Model decorativ / complex', ru: 'Декоративный / сложный узор' }, defaultPct: 30 },

  // ---- acoperis ----
  { key: 'acoperis.roofShape.l-shape', categorySlug: 'acoperis', group: 'Formă acoperiș', label: { ro: 'Acoperiș în L', ru: 'Крыша Г-образная' }, defaultPct: 20 },
  { key: 'acoperis.roofShape.t-shape', categorySlug: 'acoperis', group: 'Formă acoperiș', label: { ro: 'Acoperiș în T', ru: 'Крыша Т-образная' }, defaultPct: 35 },
  { key: 'acoperis.roofShape.u-shape', categorySlug: 'acoperis', group: 'Formă acoperiș', label: { ro: 'Acoperiș în U', ru: 'Крыша П-образная' }, defaultPct: 35 },
  { key: 'acoperis.roofShape.complex', categorySlug: 'acoperis', group: 'Formă acoperiș', label: { ro: 'Formă complexă', ru: 'Сложная форма' }, defaultPct: 50 },

  // ---- cleaning ----
  { key: 'cleaning.cleaningType.move_out', categorySlug: 'cleaning', group: 'Tip curățenie', label: { ro: 'Curățenie la mutare', ru: 'Уборка при переезде' }, defaultPct: 25 },
  { key: 'cleaning.cleaningType.deep', categorySlug: 'cleaning', group: 'Tip curățenie', label: { ro: 'Curățenie profundă', ru: 'Генеральная уборка' }, defaultPct: 35 },
  { key: 'cleaning.cleaningType.post_construction', categorySlug: 'cleaning', group: 'Tip curățenie', label: { ro: 'Curățenie post-construcție', ru: 'Уборка после ремонта' }, defaultPct: 65 },
  { key: 'cleaning.dust.medium', categorySlug: 'cleaning', group: 'Nivel praf', label: { ro: 'Praf mediu', ru: 'Средний уровень пыли' }, defaultPct: 15 },
  { key: 'cleaning.dust.high', categorySlug: 'cleaning', group: 'Nivel praf', label: { ro: 'Praf ridicat', ru: 'Высокий уровень пыли' }, defaultPct: 35 },

  // ---- mobila ----
  { key: 'mobila.materialType.mdf', categorySlug: 'mobila', group: 'Material', label: { ro: 'MDF', ru: 'МДФ' }, defaultPct: 30 },
  { key: 'mobila.materialType.lemn', categorySlug: 'mobila', group: 'Material', label: { ro: 'Lemn masiv', ru: 'Массив дерева' }, defaultPct: 60 },
  { key: 'mobila.materialType.hpl', categorySlug: 'mobila', group: 'Material', label: { ro: 'HPL', ru: 'HPL пластик' }, defaultPct: 80 },
  { key: 'mobila.hardwareTier.standard', categorySlug: 'mobila', group: 'Feronerie', label: { ro: 'Feronerie standard', ru: 'Фурнитура стандарт' }, defaultPct: 25 },
  { key: 'mobila.hardwareTier.premium', categorySlug: 'mobila', group: 'Feronerie', label: { ro: 'Feronerie premium', ru: 'Фурнитура премиум' }, defaultPct: 70 },

  // ---- santehnika ----
  { key: 'santehnika.accessDifficulty.medium', categorySlug: 'santehnika', group: 'Acces', label: { ro: 'Acces mediu', ru: 'Средний доступ' }, defaultPct: 15 },
  { key: 'santehnika.accessDifficulty.difficult', categorySlug: 'santehnika', group: 'Acces', label: { ro: 'Acces dificil', ru: 'Сложный доступ' }, defaultPct: 35 },
  { key: 'santehnika.pipeMaterial.multistrat', categorySlug: 'santehnika', group: 'Material țevi', label: { ro: 'Multistrat', ru: 'Металлопластик' }, defaultPct: 15 },
  { key: 'santehnika.pipeMaterial.pex', categorySlug: 'santehnika', group: 'Material țevi', label: { ro: 'PEX', ru: 'PEX' }, defaultPct: 20 },
  { key: 'santehnika.pipeMaterial.cupru', categorySlug: 'santehnika', group: 'Material țevi', label: { ro: 'Cupru', ru: 'Медь' }, defaultPct: 45 },

  // ---- elektrika ----
  { key: 'elektrika.wallMaterial.bca', categorySlug: 'elektrika', group: 'Material perete', label: { ro: 'BCA / beton celular', ru: 'Газобетон' }, defaultPct: 10 },
  { key: 'elektrika.wallMaterial.caramida', categorySlug: 'elektrika', group: 'Material perete', label: { ro: 'Cărămidă', ru: 'Кирпич' }, defaultPct: 20 },
  { key: 'elektrika.wallMaterial.beton', categorySlug: 'elektrika', group: 'Material perete', label: { ro: 'Beton armat', ru: 'Железобетон' }, defaultPct: 45 },
  { key: 'elektrika.cableSegment.4', categorySlug: 'elektrika', group: 'Secțiune cablu', label: { ro: 'Cablu 4 mm²', ru: 'Кабель 4 мм²' }, defaultPct: 40 },
  { key: 'elektrika.cableSegment.6', categorySlug: 'elektrika', group: 'Secțiune cablu', label: { ro: 'Cablu 6 mm²', ru: 'Кабель 6 мм²' }, defaultPct: 70 },
  { key: 'elektrika.deviceTier.standard', categorySlug: 'elektrika', group: 'Clasă aparataj', label: { ro: 'Aparataj standard', ru: 'Электрофурнитура стандарт' }, defaultPct: 50 },
  { key: 'elektrika.deviceTier.premium', categorySlug: 'elektrika', group: 'Clasă aparataj', label: { ro: 'Aparataj premium', ru: 'Электрофурнитура премиум' }, defaultPct: 150 },

  // ---- fatade ----
  { key: 'fatade.height.over9m', categorySlug: 'fatade', group: 'Înălțime', label: { ro: 'Înălțime peste 9 m', ru: 'Высота свыше 9 м' }, defaultPct: 20 },

  // ---- clima ----
  { key: 'clima.heightWork', categorySlug: 'clima', group: 'Înălțime', label: { ro: 'Lucrări la înălțime', ru: 'Работа на высоте' }, defaultPct: 25 },
];

const MODIFIER_BY_KEY: ReadonlyMap<string, PricingModifierDef> = new Map(
  PRICING_MODIFIERS.map((m) => [m.key, m]),
);

export type CompanyPricingModifiers = Record<string, number>;

export function isKnownPricingModifierKey(key: string): boolean {
  return MODIFIER_BY_KEY.has(key);
}

export function getPricingModifierDefaultPct(key: string): number {
  return MODIFIER_BY_KEY.get(key)?.defaultPct ?? 0;
}

/**
 * Coerce the raw `company.pricingModifiers` JSON into a clean map: only known
 * registry keys with finite numeric values survive.
 */
export function parseCompanyPricingModifiers(raw: unknown): CompanyPricingModifiers {
  if (!raw || typeof raw !== 'object') return {};
  const out: CompanyPricingModifiers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isKnownPricingModifierKey(key)) continue;
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(num)) out[key] = num;
  }
  return out;
}

/** Effective surcharge percent for a key: company override (if any) else default. */
export function resolvePricingModifierPct(
  key: string,
  overrides?: CompanyPricingModifiers | null,
): number {
  const override = overrides?.[key];
  if (typeof override === 'number' && Number.isFinite(override)) return override;
  return getPricingModifierDefaultPct(key);
}

/** Multiplicative factor for a key: 1 + pct/100 (premium 15 → 1.15). */
export function resolvePricingModifierFactor(
  key: string,
  overrides?: CompanyPricingModifiers | null,
): number {
  return 1 + resolvePricingModifierPct(key, overrides) / 100;
}
