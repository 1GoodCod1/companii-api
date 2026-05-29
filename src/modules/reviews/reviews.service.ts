import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Prisma, ReviewStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { findPortalCustomerForUser } from '../../common/utils/portal-customer.util';
import { RLS_SYSTEM_CONTEXT } from '../../common/rls/rls-system.util';
import { PrismaService } from '../shared/database/prisma.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import {
  REVIEWABLE_INTERVENTION_STATUSES,
  REVIEW_PUBLIC_SELECT,
  type CanCreateReviewDto,
  type CompanyReviewPublicDto,
} from './reviews.types';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async canCreate(user: JwtPayload, companyId: string): Promise<CanCreateReviewDto> {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);

    const intervention = await this.prisma.intervention.findFirst({
      where: {
        companyId,
        customerId: customer.id,
        status: { in: REVIEWABLE_INTERVENTION_STATUSES },
        review: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (!intervention) {
      return { canCreate: false, notReviewable: true };
    }

    return { canCreate: true, interventionId: intervention.id };
  }

  async canCreateForIntervention(user: JwtPayload, interventionId: string): Promise<CanCreateReviewDto> {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const intervention = await this.prisma.intervention.findFirst({
      where: { id: interventionId, customerId: customer.id },
      include: { review: { select: { id: true } } },
    });

    if (!intervention) {
      return { canCreate: false, notReviewable: true };
    }
    if (intervention.review) {
      return { canCreate: false, alreadyReviewed: true, interventionId: intervention.id };
    }
    if (!REVIEWABLE_INTERVENTION_STATUSES.includes(intervention.status)) {
      return { canCreate: false, notReviewable: true, interventionId: intervention.id };
    }

    return { canCreate: true, interventionId: intervention.id };
  }

  async create(user: JwtPayload, dto: CreateCompanyReviewDto) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);

    const intervention = await this.prisma.intervention.findFirst({
      where: { id: dto.interventionId, customerId: customer.id },
      include: { review: true },
    });

    // 1. Specification Guard Pattern
    this.validateInterventionForReview(intervention, dto.companyId);

    const author = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { firstName: true, lastName: true },
    });

    // 2. Strategy Resolver Pattern
    const displayName = this.resolveAuthorDisplayName(dto, customer, author);

    const review = await this.prisma.$transaction(async (tx) => {
      return tx.companyReview.create({
        data: {
          companyId: dto.companyId,
          customerId: customer.id,
          interventionId: dto.interventionId,
          authorUserId: user.sub,
          clientName: displayName,
          rating: dto.rating,
          comment: dto.comment?.trim() || null,
          status: ReviewStatus.VISIBLE,
        },
      });
    });

    this.eventEmitter.emit('review.created', { companyId: dto.companyId });

    return review;
  }

  @OnEvent('review.created', { async: true })
  async handleReviewCreatedEvent(payload: { companyId: string }) {
    await this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (tx) => {
      await this.recalculateCompanyRating(tx, payload.companyId);
    });
  }

  async findForCompany(companyId: string, page = 1, limit = 20) {
    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
      const safePage = Math.max(1, page);
      const safeLimit = Math.min(50, Math.max(1, limit));
      const skip = (safePage - 1) * safeLimit;

      const [items, total] = await this.prisma.inSerial([
        () =>
          this.prisma.companyReview.findMany({
            where: { companyId, status: ReviewStatus.VISIBLE },
            orderBy: { createdAt: 'desc' },
            skip,
            take: safeLimit,
            select: REVIEW_PUBLIC_SELECT,
          }),
        () =>
          this.prisma.companyReview.count({
            where: { companyId, status: ReviewStatus.VISIBLE },
          }),
      ]);

      return {
        items: items as CompanyReviewPublicDto[],
        total,
        page: safePage,
        limit: safeLimit,
      };
    });
  }

  async findForCompanyBySlug(slug: string, page = 1, limit = 20) {
    const company = await this.prisma.company.findFirst({
      where: { slug, isPublished: true, isVerified: true },
      select: { id: true },
    });
    if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);
    return this.findForCompany(company.id, page, limit);
  }

  async findMyCompanyReviews(user: JwtPayload, page = 1, limit = 20) {
    if (!user.activeCompanyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await this.prisma.inSerial([
      () =>
        this.prisma.companyReview.findMany({
          where: { companyId: user.activeCompanyId, status: ReviewStatus.VISIBLE },
          orderBy: { createdAt: 'desc' },
          skip,
          take: safeLimit,
          select: REVIEW_PUBLIC_SELECT,
        }),
      () =>
        this.prisma.companyReview.count({
          where: { companyId: user.activeCompanyId, status: ReviewStatus.VISIBLE },
        }),
    ]);

    return {
      items: items as CompanyReviewPublicDto[],
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async findMine(user: JwtPayload) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    return this.prisma.companyReview.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      select: {
        ...REVIEW_PUBLIC_SELECT,
        companyId: true,
        interventionId: true,
      },
    });
  }

  private validateInterventionForReview(intervention: any, companyId: string) {
    if (!intervention) {
      throw AppErrors.notFound(AppErrorMessages.REVIEW_INTERVENTION_NOT_FOUND);
    }
    if (intervention.companyId !== companyId) {
      throw AppErrors.badRequest(AppErrorMessages.REVIEW_COMPANY_MISMATCH);
    }
    if (intervention.review) {
      throw AppErrors.badRequest(AppErrorMessages.REVIEW_ALREADY_EXISTS);
    }
    if (!REVIEWABLE_INTERVENTION_STATUSES.includes(intervention.status)) {
      throw AppErrors.badRequest(AppErrorMessages.REVIEW_INTERVENTION_NOT_REVIEWABLE);
    }
  }

  private resolveAuthorDisplayName(
    dto: CreateCompanyReviewDto,
    customer: { fullName?: string | null },
    author?: { firstName?: string | null; lastName?: string | null } | null,
  ): string | null {
    return (
      dto.clientName?.trim() ||
      customer.fullName?.trim() ||
      [author?.firstName, author?.lastName].filter(Boolean).join(' ').trim() ||
      null
    );
  }

  private async recalculateCompanyRating(tx: Prisma.TransactionClient, companyId: string) {
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
}
