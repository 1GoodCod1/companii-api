import { ReviewStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateAdminReviewDto {
  @IsEnum(ReviewStatus)
  status!: ReviewStatus;
}
