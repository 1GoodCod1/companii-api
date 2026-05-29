import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class FindCompanyBySlugUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  execute(slug: string) {
    return this.cache.getOrSet(
      this.cache.keys.companyBySlug(slug),
      async () => {
        const company = await this.prisma.company.findFirst({
          where: { slug, isPublished: true, isVerified: true },
          include: {
            city: true,
            category: true,
            members: { where: { status: 'ACTIVE', isActive: true } },
            services: {
              where: { isPublished: true },
              include: { category: { select: { id: true, name: true, slug: true, translations: true } } },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
            badges: { where: { isActive: true } },
            galleryImages: { orderBy: { sortOrder: 'asc' } },
          },
        });
        if (!company) {
          throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);
        }
        return {
          ...company,
          contactPhone: company.showPublicPhone ? company.contactPhone : null,
          contactEmail: company.showPublicEmail ? company.contactEmail : null,
        };
      },
      this.cache.ttl.companyBySlug,
    );
  }
}
