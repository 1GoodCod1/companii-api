import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppErrors } from '../../../common/errors';
import {
  PRICING_MODIFIERS,
  isKnownPricingModifierKey,
  parseCompanyPricingModifiers,
} from '../../../../prisma/estimate-pricing-modifiers';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../authorization/company-authorization.service';

@Injectable()
export class UpdatePricingModifiersUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async execute(user: JwtPayload, companyId: string, modifiers: Record<string, number | null>) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.companyAuth.assertCompanyManagerAccess(user, companyId);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { pricingModifiers: true },
    });
    const next = parseCompanyPricingModifiers(company?.pricingModifiers);

    for (const [key, value] of Object.entries(modifiers)) {
      if (!isKnownPricingModifierKey(key)) {
        throw AppErrors.badRequest(`Coeficient de preț necunoscut: ${key}`);
      }
      if (value === null) {
        delete next[key];
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 300) {
        throw AppErrors.badRequest(`Valoare invalidă pentru „${key}" (permis 0–300%).`);
      }
      next[key] = value;
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { pricingModifiers: next as Prisma.InputJsonValue },
      select: {
        pricingModifiers: true,
        category: {
          select: {
            slug: true,
          },
        },
      },
    });

    const categorySlug = updated?.category?.slug;
    const catalog = categorySlug
      ? PRICING_MODIFIERS.filter((m) => m.categorySlug === categorySlug)
      : [];

    return {
      catalog,
      overrides: parseCompanyPricingModifiers(updated.pricingModifiers),
    };
  }
}
