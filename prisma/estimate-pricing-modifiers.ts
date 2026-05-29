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
  {
    key: 'finishing.surfaceCondition.old',
    categorySlug: 'lucrari-finisaj',
    group: 'Stare suprafață',
    label: { ro: 'Suprafață veche', ru: 'Старая поверхность' },
    defaultPct: 15,
  },
  {
    key: 'finishing.surfaceCondition.very_bad',
    categorySlug: 'lucrari-finisaj',
    group: 'Stare suprafață',
    label: { ro: 'Suprafață foarte deteriorată', ru: 'Сильно повреждённая поверхность' },
    defaultPct: 35,
  },
  {
    key: 'finishing.finishLevel.premium',
    categorySlug: 'lucrari-finisaj',
    group: 'Nivel finisaj',
    label: { ro: 'Finisaj premium', ru: 'Премиум-отделка' },
    defaultPct: 15,
  },
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
