import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { PricingRuleRepository } from '../../domain/ports/pricing-rule.repository.port';
import { parseCompanyPricingModifiers } from '../../../../../prisma/estimate-pricing-modifiers';

@Injectable()
export class PrismaPricingRuleRepository implements PricingRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCompanyServices(companyId: string): Promise<Array<{ name: string; defaultPrice: number }>> {
    const services = await this.prisma.companyService.findMany({
      where: { companyId },
      select: { name: true, defaultPrice: true },
    });
    return services.map((s) => ({ name: s.name, defaultPrice: Number(s.defaultPrice) }));
  }

  async findCompanyPricingModifiers(companyId: string): Promise<Record<string, unknown> | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { pricingModifiers: true },
    });
    if (!company?.pricingModifiers) return null;
    return parseCompanyPricingModifiers(company.pricingModifiers);
  }
}