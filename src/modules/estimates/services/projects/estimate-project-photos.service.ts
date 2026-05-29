import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';

@Injectable()
export class EstimateProjectPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
  ) {}

  async list(user: JwtPayload, projectId: string) {
    await this.access.findProjectOrThrow(user, projectId);
    return this.prisma.estimateProjectPhoto.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async add(
    user: JwtPayload,
    projectId: string,
    fileKeys: string[],
    caption?: string,
  ) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, projectId);

    const existingCount = await this.prisma.estimateProjectPhoto.count({
      where: { projectId: project.id },
    });

    await this.prisma.estimateProjectPhoto.createMany({
      data: fileKeys.map((fileKey, index) => ({
        projectId: project.id,
        fileKey,
        caption: caption ?? null,
        sortOrder: existingCount + index,
        createdById: user.sub,
      })),
    });

    return this.prisma.estimateProjectPhoto.findMany({
      where: { projectId: project.id },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateCaption(
    user: JwtPayload,
    projectId: string,
    photoId: string,
    caption: string | null,
  ) {
    this.ctx.assertManagement(user);
    const photo = await this.prisma.estimateProjectPhoto.findFirst({
      where: {
        id: photoId,
        projectId,
        project: { companyId: this.ctx.companyId(user) },
      },
    });
    if (!photo) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.estimateProjectPhoto.update({
      where: { id: photoId },
      data: { caption: caption?.trim() || null },
    });
  }

  async delete(user: JwtPayload, projectId: string, photoId: string) {
    this.ctx.assertManagement(user);
    const photo = await this.prisma.estimateProjectPhoto.findFirst({
      where: {
        id: photoId,
        projectId,
        project: { companyId: this.ctx.companyId(user) },
      },
    });
    if (!photo) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    await this.prisma.estimateProjectPhoto.delete({ where: { id: photoId } });
    return { success: true };
  }
}
