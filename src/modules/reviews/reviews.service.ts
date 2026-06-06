import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ReviewStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../common/rls/rls-system.util';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import { REVIEWS_REPOSITORY } from './domain/ports/reviews.repository.port';
import type { PrismaReviewsRepository } from './infrastructure/persistence/prisma-reviews.repository';
import {
  REVIEWABLE_INTERVENTION_STATUSES,
  REVIEW_PUBLIC_SELECT,
  type CanCreateReviewDto,
  type CompanyReviewPublicDto,
} from './reviews.types';
import { CacheService } from '../shared/cache/cache.service';

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(REVIEWS_REPOSITORY)
    private readonly reviewsRepo: PrismaReviewsRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly cache: CacheService,
  ) {}

  private async getCustomer(userId: string) {
    const customer = await this.reviewsRepo.findCustomerByUserId(userId);
    if (!customer) throw AppErrors.notFound(AppErrorMessages.PORTAL_NOT_LINKED);
    return customer;
  }

  async canCreate(user: JwtPayload, companyId: string): Promise<CanCreateReviewDto> {
    const customer = await this.getCustomer(user.sub);

    const intervention = await this.reviewsRepo.findInterventionForReview(companyId, customer.id);

    if (!intervention) {
      return { canCreate: false, notReviewable: true };
    }

    return { canCreate: true, interventionId: intervention.id };
  }

  async canCreateForIntervention(user: JwtPayload, interventionId: string): Promise<CanCreateReviewDto> {
    const customer = await this.getCustomer(user.sub);
    const intervention = await this.reviewsRepo.findInterventionWithReview(interventionId, customer.id);

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
    const customer = await this.getCustomer(user.sub);

    const intervention = await this.reviewsRepo.findInterventionDetail(dto.interventionId, customer.id);

    // 1. Specification Guard Pattern
    this.validateInterventionForReview(intervention, dto.companyId);

    const author = await this.reviewsRepo.findUserById(user.sub);

    // 2. Strategy Resolver Pattern
    const displayName = this.resolveAuthorDisplayName(dto, customer, author);

    const review = await this.reviewsRepo.runTransaction(async (tx) => {
      return this.reviewsRepo.createReview({
        companyId: dto.companyId,
        customerId: customer.id,
        interventionId: dto.interventionId,
        authorUserId: user.sub,
        clientName: displayName,
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
        status: ReviewStatus.VISIBLE,
      }, tx);
    });

    await this.eventEmitter.emitAsync('review.created', { companyId: dto.companyId });

    await this.cache.invalidatePortalDashboard(user.sub);

    return review;
  }

  @OnEvent('review.created', { async: true })
  async handleReviewCreatedEvent(payload: { companyId: string }) {
    await this.reviewsRepo.runWithRls(RLS_SYSTEM_CONTEXT, async (tx) => {
      await this.reviewsRepo.recalculateRating(payload.companyId, tx);
    });
  }

  async findForCompany(companyId: string, page = 1, limit = 20) {
    return await this.reviewsRepo.runWithRls(RLS_SYSTEM_CONTEXT, async () => {
      const safePage = Math.max(1, page);
      const safeLimit = Math.min(50, Math.max(1, limit));
      const skip = (safePage - 1) * safeLimit;

      const [items, total] = await this.reviewsRepo.findReviewsForCompany(companyId, skip, safeLimit);

      return {
        items: items as CompanyReviewPublicDto[],
        total,
        page: safePage,
        limit: safeLimit,
      };
    });
  }

  async findForCompanyBySlug(slug: string, page = 1, limit = 20) {
    const company = await this.reviewsRepo.findCompanyBySlug(slug);
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

    const [items, total] = await this.reviewsRepo.findReviewsForCompany(user.activeCompanyId, skip, safeLimit);

    return {
      items: items as CompanyReviewPublicDto[],
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  async findMine(user: JwtPayload) {
    const customer = await this.getCustomer(user.sub);
    return this.reviewsRepo.findReviewsByCustomer(customer.id);
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
}
