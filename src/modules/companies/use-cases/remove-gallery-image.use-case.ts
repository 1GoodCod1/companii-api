import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../authorization/company-authorization.service';
import { invalidateCompanyCacheById } from '../utils/company-cache.util';

@Injectable()
export class RemoveGalleryImageUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async execute(user: JwtPayload, companyId: string, imageId: string) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.companyAuth.assertCompanyManagerAccess(user, companyId);
    const image = await this.prisma.companyGalleryImage.findFirst({
      where: { id: imageId, companyId },
    });
    if (!image) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    await this.prisma.companyGalleryImage.delete({ where: { id: imageId } });
    await invalidateCompanyCacheById(this.prisma, this.cache, companyId);
    return { success: true };
  }
}
