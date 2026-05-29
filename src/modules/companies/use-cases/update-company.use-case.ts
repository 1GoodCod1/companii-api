import { Injectable } from '@nestjs/common';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../authorization/company-authorization.service';
import { CreateCompanyDto } from '../dto/create-company.dto';

@Injectable()
export class UpdateCompanyUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async execute(user: JwtPayload, companyId: string, data: Partial<CreateCompanyDto>) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.companyAuth.assertCompanyManagerAccess(user, companyId);
    const { logoUrl, ...rest } = data;

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    const isOwner = company?.ownerUserId === user.sub;

    let updateData: Record<string, unknown> = {};

    if (isOwner || user.accountKind === 'PLATFORM_ADMIN') {
      updateData = {
        ...rest,
        ...(logoUrl === '' || logoUrl === null
          ? { logoUrl: null }
          : logoUrl !== undefined
            ? { logoUrl }
            : {}),
      };
    } else {
      updateData = {
        contactPhone: rest.contactPhone,
        contactEmail: rest.contactEmail,
        description: rest.description,
        cityId: rest.cityId,
        categoryId: rest.categoryId,
        ...(logoUrl === '' || logoUrl === null
          ? { logoUrl: null }
          : logoUrl !== undefined
            ? { logoUrl }
            : {}),
      };
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: updateData,
    });
    await this.cache.invalidatePublicCompanies(updated.slug);
    return updated;
  }
}
