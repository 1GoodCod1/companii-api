import type { EstimateComment, Prisma } from '@prisma/client';

export const ESTIMATE_COMMENT_REPOSITORY = Symbol('EstimateCommentRepository');

export interface EstimateCommentRepository {
  findByProject(projectId: string): Promise<EstimateComment[]>;
  create(
    data: Prisma.EstimateCommentUncheckedCreateInput,
  ): Promise<EstimateComment>;
}
