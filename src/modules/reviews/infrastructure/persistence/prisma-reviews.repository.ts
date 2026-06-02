import { Injectable } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { RlsContext } from '@/common/types/rls-context';
import type { ReviewsRepository } from '../../domain/ports/reviews.repository.port';
import type { CompanyReviewPublicDto } from '../../reviews.types';
import { REVIEWABLE_INTERVENTION_STATUSES, REVIEW_PUBLIC_SELECT } from '../../reviews.types';

@Injectable()
export class PrismaReviewsRepository implements ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCustomerByUserId(userId: string) {
    return await this.prisma.companyCustomer.findFirst({
      where: { portalUserId: userId },
    });
  }

  async findInterventionForReview(companyId: string, customerId: string): Promise<{ id: string } | null> {
    return await this.prisma.intervention.findFirst({
      where: {
        companyId,
        customerId,
        status: { in: REVIEWABLE_INTERVENTION_STATUSES },
        review: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
  }

  async findInterventionWithReview(id: string, customerId: string) {
    return await this.prisma.intervention.findFirst({
      where: { id, customerId },
      include: { review: { select: { id: true } } },
    });
  }

  async findInterventionDetail(id: string, customerId: string) {
    return await this.prisma.intervention.findFirst({
      where: { id, customerId },
      include: { review: true },
    });
  }

  async findUserById(userId: string) {
    return await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
  }

  async createReview(data: Prisma.CompanyReviewUncheckedCreateInput, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.companyReview.create({ data });
  }

  async findReviewsForCompany(companyId: string, skip: number, take: number): Promise<[CompanyReviewPublicDto[], number]> {
    return await this.prisma.inSerial([
      () =>
        this.prisma.companyReview.findMany({
          where: { companyId, status: ReviewStatus.VISIBLE },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          select: REVIEW_PUBLIC_SELECT,
        }),
      () =>
        this.prisma.companyReview.count({
          where: { companyId, status: ReviewStatus.VISIBLE },
        }),
    ]);
  }

  async findCompanyBySlug(slug: string) {
    return await this.prisma.company.findFirst({
      where: { slug, isPublished: true, isVerified: true },
      select: { id: true },
    });
  }

  async findReviewsByCustomer(customerId: string) {
    return await this.prisma.companyReview.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        ...REVIEW_PUBLIC_SELECT,
        companyId: true,
        interventionId: true,
      },
    });
  }

  async recalculateRating(companyId: string, tx: Prisma.TransactionClient) {
    const stats = await tx.companyReview.aggregate({
      where: { companyId, status: ReviewStatus.VISIBLE },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await tx.company.update({
      where: { id: companyId },
      data: {
        rating: stats._avg.rating ?? 0,
        totalReviews: stats._count._all,
      },
    });
  }

  async runWithRls<T>(context: RlsContext, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return await this.prisma.withRlsContext(context, fn);
  }

  async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return await this.prisma.$transaction(fn);
  }
}
