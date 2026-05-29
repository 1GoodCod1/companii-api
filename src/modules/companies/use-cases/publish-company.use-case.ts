import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../authorization/company-authorization.service';

@Injectable()
export class PublishCompanyUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async execute(user: JwtPayload, companyId: string) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.companyAuth.assertCompanyOwner(user, companyId);

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);
    if (!company.isVerified) {
      throw AppErrors.badRequest(AppErrorMessages.COMPANY_NOT_VERIFIED);
    }
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { isPublished: true },
    });
    await this.cache.invalidatePublicCompanies(updated.slug);
    return updated;
  }
}
