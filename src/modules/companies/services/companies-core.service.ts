import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { COMPANY_GALLERY_MAX_VIDEOS } from '../../../common/constants';
import { CacheService } from '../../shared/cache/cache.service';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompanyAuthorizationService } from '../authorization/company-authorization.service';
import { isGalleryVideoUrl } from '../companies.constants';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { AddGalleryImageDto } from '../dto/add-gallery-image.dto';
import { slugifyCompanyName } from '../utils/slug.util';

@Injectable()
export class CompaniesCoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  async create(user: JwtPayload, dto: CreateCompanyDto) {
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

  async findMe(user: JwtPayload) {
    const companyInclude = {
      subscription: { include: { plan: true } },
      galleryImages: { orderBy: { sortOrder: 'asc' as const } },
    };
    const memberships = await this.prisma.companyMember.findMany({
      where: { userId: user.sub, status: 'ACTIVE' },
      include: { company: { include: companyInclude } },
    });
    const owned = await this.prisma.company.findMany({
      where: { ownerUserId: user.sub },
      include: companyInclude,
    });
    return { memberships, owned };
  }

  async publish(user: JwtPayload, companyId: string) {
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

  async update(user: JwtPayload, companyId: string, data: Partial<CreateCompanyDto>) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.assertCompanyAccess(user, companyId);
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

  async addGalleryImage(user: JwtPayload, companyId: string, dto: AddGalleryImageDto) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.assertCompanyAccess(user, companyId);

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
    await this.invalidateCompanyCache(companyId);
    return image;
  }

  async removeGalleryImage(user: JwtPayload, companyId: string, imageId: string) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.assertCompanyAccess(user, companyId);
    const image = await this.prisma.companyGalleryImage.findFirst({
      where: { id: imageId, companyId },
    });
    if (!image) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    await this.prisma.companyGalleryImage.delete({ where: { id: imageId } });
    await this.invalidateCompanyCache(companyId);
    return { success: true };
  }

  private async invalidateCompanyCache(companyId: string) {
    const company = await this.prisma.runOutsideRlsContext(() =>
      this.prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } }),
    );
    if (company?.slug) await this.cache.invalidatePublicCompanies(company.slug);
  }

  private async assertCompanyAccess(user: JwtPayload, companyId: string) {
    if (user.accountKind === 'PLATFORM_ADMIN') return;
    const m = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        userId: user.sub,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'MANAGER'] },
      },
    });
    if (!m) throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
  }
}
