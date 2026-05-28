import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';

export interface EstimateCommentDto {
  id: string;
  authorKind: 'CLIENT' | 'CONTRACTOR';
  authorId: string;
  body: string;
  createdAt: string;
}

@Injectable()
export class EstimateCommentService {
  constructor(private readonly prisma: PrismaService) {}

  async listComments(projectId: string): Promise<EstimateCommentDto[]> {
    const comments = await this.prisma.estimateComment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    return comments.map((c) => ({
      id: c.id,
      authorKind: c.authorKind as 'CLIENT' | 'CONTRACTOR',
      authorId: c.authorId,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async addComment(
    projectId: string,
    authorId: string,
    authorKind: 'CLIENT' | 'CONTRACTOR',
    body: string,
  ): Promise<EstimateCommentDto> {
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 2000) {
      throw AppErrors.badRequest('Comment must be 1-2000 characters');
    }

    const comment = await this.prisma.estimateComment.create({
      data: {
        projectId,
        authorId,
        authorKind,
        body: trimmed,
      },
    });

    return {
      id: comment.id,
      authorKind: comment.authorKind as 'CLIENT' | 'CONTRACTOR',
      authorId: comment.authorId,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}