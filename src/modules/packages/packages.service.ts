import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../common/rls/rls-system.util';
import { CacheService } from '../shared/cache/cache.service';
import { PrismaService } from '../shared/database/prisma.service';
import type { JwtPayload } from '../auth/types/jwt-payload';

@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  listPublic(companySlug?: string) {
    const slugKey = companySlug ?? null;
    return this.cache.getOrSet(
      this.cache.keys.packagesList(slugKey),
      () =>
        this.prisma.servicePackage.findMany({
          where: {
            isPublished: true,
            ...(companySlug
              ? { company: { slug: companySlug, isPublished: true } }
              : {}),
          },
          include: { company: true, category: true },
          take: 50,
        }),
      this.cache.ttl.packagesList,
    );
  }

  async book(
    packageId: string,
    body: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      scheduledAt?: string;
    },
  ) {
    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
      const pkg = await this.prisma.servicePackage.findFirst({
        where: { id: packageId, isPublished: true },
      });
      if (!pkg) throw AppErrors.notFound(AppErrorMessages.PACKAGE_NOT_FOUND);

      const status =
        pkg.paymentMode === 'PREPAID' ? 'PENDING_PAYMENT' : 'CONFIRMED';

      const booking = await this.prisma.packageBooking.create({
        data: {
          packageId: pkg.id,
          companyId: pkg.companyId,
          customerName: body.customerName,
          customerPhone: body.customerPhone,
          customerEmail: body.customerEmail,
          status,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        },
        include: { package: { include: { category: true } } },
      });

      await this.prisma.companyLead.create({
        data: {
          companyId: pkg.companyId,
          bookingId: booking.id,
          contactName: body.customerName.trim(),
          contactPhone: body.customerPhone.trim(),
          contactEmail: body.customerEmail?.trim().toLowerCase(),
          scheduledAt: booking.scheduledAt ?? undefined,
          categoryId: booking.package.categoryId,
          packageTitle: booking.package.title,
          message: `Cerere pachet: ${booking.package.title}`,
          source: 'PACKAGE_BOOKING',
          status: 'NEW',
        },
      });

      return booking;
    });
  }

  async createForCompany(
    user: JwtPayload,
    companyId: string,
    data: Record<string, unknown>,
  ) {
    const isPublished = Boolean(data.isPublished);
    const pkg = await this.prisma.servicePackage.create({
      data: {
        companyId,
        slug: `${String(data.title ?? 'pkg').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        title: String(data.title),
        description: String(data.description ?? ''),
        categoryId: String(data.categoryId),
        price: data.price as never,
        durationMinutes: Number(data.durationMinutes ?? 60),
        paymentMode: (data.paymentMode as 'PREPAID' | 'ON_SITE') ?? 'ON_SITE',
        isPublished,
        status: isPublished ? 'PUBLISHED' : 'DRAFT',
      },
      include: { company: { select: { slug: true } }, category: true },
    });
    void this.cache.invalidatePublicPackages();
    return pkg;
  }

  listForCompany(companyId: string) {
    return this.prisma.servicePackage.findMany({
      where: { companyId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateForCompany(
    companyId: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    const existing = await this.prisma.servicePackage.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.PACKAGE_NOT_FOUND);

    const isPublished =
      data.isPublished !== undefined ? Boolean(data.isPublished) : existing.isPublished;

    const pkg = await this.prisma.servicePackage.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: String(data.title) } : {}),
        ...(data.description !== undefined ? { description: String(data.description) } : {}),
        ...(data.categoryId !== undefined ? { categoryId: String(data.categoryId) } : {}),
        ...(data.price !== undefined ? { price: data.price as never } : {}),
        ...(data.durationMinutes !== undefined
          ? { durationMinutes: Number(data.durationMinutes) }
          : {}),
        ...(data.paymentMode !== undefined
          ? { paymentMode: data.paymentMode as 'PREPAID' | 'ON_SITE' }
          : {}),
        isPublished,
        status: isPublished ? 'PUBLISHED' : 'DRAFT',
      },
      include: { category: true, company: { select: { slug: true } } },
    });
    void this.cache.invalidatePublicPackages();
    return pkg;
  }

  async deleteForCompany(companyId: string, id: string) {
    const existing = await this.prisma.servicePackage.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.PACKAGE_NOT_FOUND);
    await this.prisma.servicePackage.delete({ where: { id } });
    void this.cache.invalidatePublicPackages();
    return { deleted: true };
  }
}
