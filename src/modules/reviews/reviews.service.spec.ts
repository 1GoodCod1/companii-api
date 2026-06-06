import { ReviewsService } from './reviews.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import { ReviewStatus } from '@prisma/client';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let reviewsRepo: {
    findCustomerByUserId: jest.Mock;
    findInterventionDetail: jest.Mock;
    findUserById: jest.Mock;
    runTransaction: jest.Mock;
    createReview: jest.Mock;
    runWithRls: jest.Mock;
    recalculateRating: jest.Mock;
  };
  let eventEmitter: { emitAsync: jest.Mock };
  let cache: { invalidatePortalDashboard: jest.Mock };

  beforeEach(() => {
    reviewsRepo = {
      findCustomerByUserId: jest.fn(),
      findInterventionDetail: jest.fn(),
      findUserById: jest.fn(),
      runTransaction: jest.fn((cb) => cb({})),
      createReview: jest.fn(),
      runWithRls: jest.fn((_ctx, cb) => cb({})),
      recalculateRating: jest.fn(),
    };

    eventEmitter = {
      emitAsync: jest.fn().mockResolvedValue([]),
    };

    cache = {
      invalidatePortalDashboard: jest.fn().mockResolvedValue(undefined),
    };

    service = new ReviewsService(reviewsRepo as any, eventEmitter as any, cache as any);
  });

  const mockUser: JwtPayload = {
    sub: 'user-123',
    email: 'client@test.com',
    accountKind: 'END_CLIENT',
  };

  const mockCustomer = {
    id: 'customer-123',
    fullName: 'John Client',
  };

  const mockIntervention = {
    id: 'inter-123',
    companyId: 'company-123',
    status: 'COMPLETED',
    review: null,
  };

  describe('create', () => {
    it('creates a review and emits the review.created event', async () => {
      reviewsRepo.findCustomerByUserId.mockResolvedValue(mockCustomer);
      reviewsRepo.findInterventionDetail.mockResolvedValue(mockIntervention);
      reviewsRepo.findUserById.mockResolvedValue({ firstName: 'John', lastName: 'Client' });

      const createdReview = {
        id: 'review-123',
        companyId: 'company-123',
        customerId: 'customer-123',
        rating: 5,
      };
      reviewsRepo.createReview.mockResolvedValue(createdReview);

      const dto: CreateCompanyReviewDto = {
        companyId: 'company-123',
        interventionId: 'inter-123',
        rating: 5,
        comment: 'Excellent service!',
      };

      const result = await service.create(mockUser, dto);

      expect(result).toEqual(createdReview);
      expect(reviewsRepo.runTransaction).toHaveBeenCalled();
      expect(reviewsRepo.createReview).toHaveBeenCalledWith(
        {
          companyId: dto.companyId,
          customerId: mockCustomer.id,
          interventionId: dto.interventionId,
          authorUserId: mockUser.sub,
          clientName: 'John Client',
          rating: dto.rating,
          comment: dto.comment,
          status: ReviewStatus.VISIBLE,
        },
        {},
      );
      expect(eventEmitter.emitAsync).toHaveBeenCalledWith('review.created', {
        companyId: 'company-123',
      });
      expect(cache.invalidatePortalDashboard).toHaveBeenCalledWith(mockUser.sub);
    });
  });

  describe('handleReviewCreatedEvent', () => {
    it('recalculates average rating in system context', async () => {
      await service.handleReviewCreatedEvent({ companyId: 'company-123' });

      expect(reviewsRepo.runWithRls).toHaveBeenCalled();
      expect(reviewsRepo.recalculateRating).toHaveBeenCalledWith('company-123', {});
    });
  });
});
