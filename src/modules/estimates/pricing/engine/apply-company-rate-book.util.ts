import type { BlueprintPricingRule } from '../pricing.types';
import { normalizeRateKey } from '../shared/pricing-shared.util';

export function applyCompanyRateBook(
  rules: BlueprintPricingRule[],
  services: Array<{ name: string; defaultPrice: number | { toString(): string } }>,
): BlueprintPricingRule[] {
  if (!services.length) return rules;

  const priceByName = new Map(
    services.map((service) => [normalizeRateKey(service.name), Number(service.defaultPrice)]),
  );

  const getMatchCountInBlueprint = (name: string): number => {
    let count = 0;
    for (const rule of rules) {
      const ruleKey = normalizeRateKey(rule.description);
      if (ruleKey.includes(name) || name.includes(ruleKey)) {
        count++;
      }
    }
    return count;
  };

  return rules.map((rule) => {
    const ruleKey = normalizeRateKey(rule.description);
    const direct = priceByName.get(ruleKey);
    if (direct != null) {
      return { ...rule, unitPrice: direct };
    }

    for (const [name, price] of priceByName) {
      if (ruleKey.includes(name) || name.includes(ruleKey)) {
        if (getMatchCountInBlueprint(name) === 1) {
          return { ...rule, unitPrice: price };
        }
      }
    }

    return rule;
  });
}
