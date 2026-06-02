import { Injectable } from '@nestjs/common';
import type { EstimateComment, Prisma } from '@prisma/client';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { EstimateCommentRepository } from '../../domain/ports/estimate-comment.repository.port';

@Injectable()
export class PrismaEstimateCommentRepository
  implements EstimateCommentRepository
{
  constructor(private readonly prisma: PrismaService) {}

  findByProject(projectId: string): Promise<EstimateComment[]> {
    return this.prisma.estimateComment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(
    data: Prisma.EstimateCommentUncheckedCreateInput,
  ): Promise<EstimateComment> {
    return this.prisma.estimateComment.create({ data });
  }
}
