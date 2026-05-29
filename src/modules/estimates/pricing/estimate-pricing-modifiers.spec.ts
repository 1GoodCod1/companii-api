import {
  PRICING_MODIFIERS,
  getPricingModifierDefaultPct,
  isKnownPricingModifierKey,
  parseCompanyPricingModifiers,
  resolvePricingModifierFactor,
  resolvePricingModifierPct,
} from '../../../../prisma/estimate-pricing-modifiers';

describe('estimate-pricing-modifiers registry', () => {
  it('has unique keys', () => {
    const keys = PRICING_MODIFIERS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolves the registry default when no override given', () => {
    expect(resolvePricingModifierPct('finishing.finishLevel.premium')).toBe(15);
    expect(resolvePricingModifierPct('finishing.surfaceCondition.very_bad')).toBe(35);
    expect(resolvePricingModifierFactor('finishing.surfaceCondition.old')).toBeCloseTo(1.15, 5);
  });

  it('prefers a company override over the default', () => {
    const overrides = { 'finishing.finishLevel.premium': 25 };
    expect(resolvePricingModifierPct('finishing.finishLevel.premium', overrides)).toBe(25);
    expect(resolvePricingModifierFactor('finishing.finishLevel.premium', overrides)).toBeCloseTo(1.25, 5);
    expect(resolvePricingModifierPct('finishing.surfaceCondition.old', overrides)).toBe(15);
  });

  it('honors an explicit override of 0', () => {
    expect(
      resolvePricingModifierPct('finishing.finishLevel.premium', { 'finishing.finishLevel.premium': 0 }),
    ).toBe(0);
  });

  it('parseCompanyPricingModifiers keeps only known keys with finite numbers', () => {
    const parsed = parseCompanyPricingModifiers({
      'finishing.finishLevel.premium': 20,
      'finishing.surfaceCondition.old': 'not-a-number',
      'unknown.key': 99,
      'finishing.surfaceCondition.very_bad': 40,
    });
    expect(parsed).toEqual({
      'finishing.finishLevel.premium': 20,
      'finishing.surfaceCondition.very_bad': 40,
    });
  });

  it('reports known/unknown keys', () => {
    expect(isKnownPricingModifierKey('finishing.finishLevel.premium')).toBe(true);
    expect(isKnownPricingModifierKey('nope')).toBe(false);
    expect(getPricingModifierDefaultPct('nope')).toBe(0);
  });
});
