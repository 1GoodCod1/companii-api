export const PRICING_RULE_REPOSITORY = Symbol('PricingRuleRepository');

export interface PricingRuleRepository {
  findCompanyServices(companyId: string): Promise<Array<{ name: string; defaultPrice: number }>>;
  findCompanyPricingModifiers(
    companyId: string,
  ): Promise<Record<string, unknown> | null>;
}