import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../common/rls/rls-system.util';
import { normalizePhone } from '../../common/utils/phone.util';
import { CacheService } from '../shared/cache/cache.service';
import { PrismaService } from '../shared/database/prisma.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import type { RlsContext } from '../../common/types/rls-context';
import { CreateCompanyDto } from './dto/create-company.dto';
import { AddGalleryImageDto } from './dto/add-gallery-image.dto';
import { CompanyAuthorizationService } from './company-authorization.service';

function transliterate(text: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
    'я': 'ya',
    'ă': 'a', 'â': 'a', 'î': 'i', 'ș': 's', 'ț': 't'
  };
  return text
    .split('')
    .map(char => {
      const lower = char.toLowerCase();
      if (map[lower] !== undefined) {
        return char === char.toUpperCase() ? map[lower].toUpperCase() : map[lower];
      }
      return char;
    })
    .join('');
}

function slugify(name: string): string {
  const transliterated = transliterate(name);
  let slug = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  if (!slug) {
    slug = 'company-' + Math.random().toString(36).substring(2, 8);
  }
  return slug;
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  private rls(user: JwtPayload): RlsContext {
    return {
      userId: user.sub,
      accountKind: user.accountKind,
      companyId: user.activeCompanyId,
      companyRole: user.companyRole,
      memberId: user.memberId,
      customerId: user.customerId,
    };
  }

  async findCities() {
    return this.prisma.city.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(user: JwtPayload, dto: CreateCompanyDto) {
    if (user.accountKind !== 'PLATFORM_ADMIN') {
      const ownedCount = await this.prisma.company.count({
        where: { ownerUserId: user.sub },
      });
      if (ownedCount > 0) {
        throw AppErrors.conflict(AppErrorMessages.COMPANY_ALREADY_OWNED);
      }
    }

    const baseSlug = slugify(dto.name);
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
    void this.cache.invalidatePublicCompanies(company.slug);
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

  async findPublicList(params: {
    cityId?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 50);
    const cacheKey = this.cache.keys.companiesList({
      cityId: params.cityId,
      categoryId: params.categoryId,
      page,
      limit,
    });
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const where: Prisma.CompanyWhereInput = {
          isPublished: true,
          isVerified: true,
          ...(params.cityId ? { cityId: params.cityId } : {}),
          ...(params.categoryId ? { categoryId: params.categoryId } : {}),
        };
        const [items, total] = await Promise.all([
          this.prisma.company.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              city: true,
              category: true,
              galleryImages: { orderBy: { sortOrder: 'asc' }, take: 1 },
            },
            orderBy: { rating: 'desc' },
          }),
          this.prisma.company.count({ where }),
        ]);
        const filteredItems = items.map((item) => ({
          ...item,
          contactPhone: item.showPublicPhone ? item.contactPhone : null,
          contactEmail: item.showPublicEmail ? item.contactEmail : null,
        }));
        return { items: filteredItems, total, page, limit };
      },
      this.cache.ttl.companiesList,
    );
  }

  async findBySlug(slug: string) {
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
              include: { category: { select: { id: true, name: true, slug: true } } },
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
    void this.cache.invalidatePublicCompanies(updated.slug);
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
    void this.cache.invalidatePublicCompanies(updated.slug);
    return updated;
  }

  async addGalleryImage(user: JwtPayload, companyId: string, dto: AddGalleryImageDto) {
    this.companyAuth.assertSameCompanyContext(user, companyId);
    await this.assertCompanyAccess(user, companyId);
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
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (company) void this.cache.invalidatePublicCompanies(company.slug);
  }

  async requestPublicService(
    companySlug: string,
    serviceId: string,
    body: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      message?: string;
      scheduledAt?: string;
    },
  ) {
    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
      const company = await this.prisma.company.findFirst({
        where: { slug: companySlug, isPublished: true, isVerified: true },
        select: { id: true, slug: true },
      });
      if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);

      const service = await this.prisma.companyService.findFirst({
        where: { id: serviceId, companyId: company.id, isPublished: true },
        include: { category: true },
      });
      if (!service) throw AppErrors.notFound(AppErrorMessages.SERVICE_NOT_FOUND);

      const phone = normalizePhone(body.customerPhone) ?? body.customerPhone.trim();
      const lead = await this.prisma.companyLead.create({
        data: {
          companyId: company.id,
          contactName: body.customerName.trim(),
          contactPhone: phone,
          contactEmail: body.customerEmail?.trim().toLowerCase(),
          message: body.message?.trim() || `Cerere serviciu: ${service.name}`,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
          categoryId: service.categoryId ?? undefined,
          serviceTitle: service.name,
          source: 'SERVICE_REQUEST',
          status: 'NEW',
        },
      });

      return { leadId: lead.id, service: { id: service.id, name: service.name } };
    });
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
