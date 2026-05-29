import { ReviewsService } from './reviews.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import { ReviewStatus } from '@prisma/client';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: any;
  let eventEmitter: any;

  beforeEach(() => {
    prisma = {
      companyCustomer: {
        findFirst: jest.fn(),
      },
      intervention: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      companyReview: {
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      company: {
        update: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
      withRlsContext: jest.fn((ctx, cb) => cb(prisma)),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    service = new ReviewsService(prisma as any, eventEmitter as any);
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
      prisma.companyCustomer.findFirst.mockResolvedValue(mockCustomer);
      prisma.intervention.findFirst.mockResolvedValue(mockIntervention);
      prisma.user.findUnique.mockResolvedValue({ firstName: 'John', lastName: 'Client' });

      const createdReview = {
        id: 'review-123',
        companyId: 'company-123',
        customerId: 'customer-123',
        rating: 5,
      };
      prisma.companyReview.create.mockResolvedValue(createdReview);

      const dto: CreateCompanyReviewDto = {
        companyId: 'company-123',
        interventionId: 'inter-123',
        rating: 5,
        comment: 'Excellent service!',
      };

      const result = await service.create(mockUser, dto);

      expect(result).toEqual(createdReview);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.companyReview.create).toHaveBeenCalledWith({
        data: {
          companyId: dto.companyId,
          customerId: mockCustomer.id,
          interventionId: dto.interventionId,
          authorUserId: mockUser.sub,
          clientName: 'John Client',
          rating: dto.rating,
          comment: dto.comment,
          status: ReviewStatus.VISIBLE,
        },
      });

      // Decoupled rating recalculation assertions
      expect(eventEmitter.emit).toHaveBeenCalledWith('review.created', {
        companyId: 'company-123',
      });
    });
  });

  describe('handleReviewCreatedEvent', () => {
    it('recalculates average rating in system context', async () => {
      prisma.companyReview.aggregate.mockResolvedValue({
        _avg: { rating: 4.5 },
        _count: { _all: 10 },
      });

      await service.handleReviewCreatedEvent({ companyId: 'company-123' });

      expect(prisma.withRlsContext).toHaveBeenCalled();
      expect(prisma.companyReview.aggregate).toHaveBeenCalledWith({
        where: { companyId: 'company-123', status: ReviewStatus.VISIBLE },
        _avg: { rating: true },
        _count: { _all: true },
      });
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-123' },
        data: {
          rating: 4.5,
          totalReviews: 10,
        },
      });
    });
  });
});
