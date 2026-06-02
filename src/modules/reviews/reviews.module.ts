import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { REVIEWS_REPOSITORY } from './domain/ports/reviews.repository.port';
import { PrismaReviewsRepository } from './infrastructure/persistence/prisma-reviews.repository';

@Module({
  imports: [CompaniesModule],
  controllers: [ReviewsController],
  providers: [
    ReviewsService,
    {
      provide: REVIEWS_REPOSITORY,
      useClass: PrismaReviewsRepository,
    },
  ],
})
export class ReviewsModule {}
