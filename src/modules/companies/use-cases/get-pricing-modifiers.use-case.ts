import { Injectable } from '@nestjs/common';
import { PRICING_MODIFIERS, parseCompanyPricingModifiers } from '../../../../prisma/estimate-pricing-modifiers';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../authorization/company-authorization.service';

@Injectable()
export class GetPricingModifiersUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async execute(user: JwtPayload, companyId: string) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.companyAuth.assertCompanyManagerAccess(user, companyId);
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { pricingModifiers: true },
    });
    return {
      catalog: PRICING_MODIFIERS,
      overrides: parseCompanyPricingModifiers(company?.pricingModifiers),
    };
  }
}
