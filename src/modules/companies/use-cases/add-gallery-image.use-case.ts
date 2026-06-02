import { Injectable } from '@nestjs/common';
import { AppErrors } from '../../../common/errors';
import { COMPANY_GALLERY_MAX_VIDEOS } from '../../../common/constants';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../authorization/company-authorization.service';
import { isGalleryVideoUrl } from '../companies.constants';
import { AddGalleryImageDto } from '@/modules/companies/dto/add-gallery-image.dto';
import { invalidateCompanyCacheById } from '../utils/company-cache.util';

@Injectable()
export class AddGalleryImageUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async execute(user: JwtPayload, companyId: string, dto: AddGalleryImageDto) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.companyAuth.assertCompanyManagerAccess(user, companyId);

    if (isGalleryVideoUrl(dto.url)) {
      const videoCount = await this.prisma.companyGalleryImage.count({
        where: {
          companyId,
          OR: [
            { url: { endsWith: '.mp4', mode: 'insensitive' } },
            { url: { endsWith: '.mov', mode: 'insensitive' } },
            { url: { endsWith: '.webm', mode: 'insensitive' } },
          ],
        },
      });
      if (videoCount >= COMPANY_GALLERY_MAX_VIDEOS) {
        throw AppErrors.badRequest(
          `Maximum ${COMPANY_GALLERY_MAX_VIDEOS} videoclipuri în galerie.`,
        );
      }
    }

    const maxOrder = await this.prisma.companyGalleryImage.aggregate({
      where: { companyId },
      _max: { sortOrder: true },
    });
    const image = await this.prisma.companyGalleryImage.create({
      data: {
        companyId,
        url: dto.url,
        caption: dto.caption,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
    await invalidateCompanyCacheById(this.prisma, this.cache, companyId);
    return image;
  }
}
