import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { slugifyCompanyName } from '../utils/slug.util';

@Injectable()
export class CreateCompanyUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async execute(user: JwtPayload, dto: CreateCompanyDto) {
    if (user.accountKind !== 'PLATFORM_ADMIN') {
      const ownedCount = await this.prisma.company.count({
        where: { ownerUserId: user.sub },
      });
      if (ownedCount > 0) {
        throw AppErrors.conflict(AppErrorMessages.COMPANY_ALREADY_OWNED);
      }
    }

    const baseSlug = slugifyCompanyName(dto.name);
    let slug = baseSlug;
    let n = 0;
    while (await this.prisma.company.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${++n}`;
    }

    const freePlan = await this.prisma.companyPlan.findUnique({
      where: { code: 'FREE' },
    });
    if (!freePlan) throw AppErrors.internal('FREE plan not seeded');

    const company = await this.prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          slug,
          ownerUserId: user.sub,
          name: dto.name,
          legalName: dto.legalName,
          idno: dto.idno,
          legalAddress: dto.legalAddress,
          cityId: dto.cityId,
          categoryId: dto.categoryId,
          isTvaPayer: dto.isTvaPayer ?? false,
          tvaCode: dto.tvaCode,
          description: dto.description,
          contactPhone: dto.contactPhone,
          contactEmail: dto.contactEmail,
          showPublicPhone: dto.showPublicPhone ?? true,
          showPublicEmail: dto.showPublicEmail ?? true,
          logoUrl: dto.logoUrl,
        },
      });
      await tx.companyMember.create({
        data: {
          companyId: created.id,
          userId: user.sub,
          role: 'OWNER',
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });
      await tx.companySubscription.create({
        data: {
          companyId: created.id,
          planId: freePlan.id,
          status: 'TRIAL',
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        },
      });
      return created;
    });
    await this.cache.invalidatePublicCompanies(company.slug);
    return company;
  }
}
