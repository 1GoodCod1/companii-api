import { Module } from '@nestjs/common';
import { EstimateCommentService } from './services/history/estimate-comment.service';
import { ESTIMATE_COMMENT_REPOSITORY } from './domain/ports/estimate-comment.repository.port';
import { PrismaEstimateCommentRepository } from './infrastructure/persistence/prisma-estimate-comment.repository';

@Module({
  providers: [
    EstimateCommentService,
    PrismaEstimateCommentRepository,
    {
      provide: ESTIMATE_COMMENT_REPOSITORY,
      useExisting: PrismaEstimateCommentRepository,
    },
  ],
  exports: [EstimateCommentService],
})
export class EstimateCommentModule {}
