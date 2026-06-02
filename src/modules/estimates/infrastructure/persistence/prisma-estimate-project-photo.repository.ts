import { Injectable } from '@nestjs/common';
import type { EstimateProjectPhoto, Prisma } from '@prisma/client';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { EstimateProjectPhotoRepository } from '../../domain/ports/estimate-project-photo.repository.port';

@Injectable()
export class PrismaEstimateProjectPhotoRepository
  implements EstimateProjectPhotoRepository
{
  constructor(private readonly prisma: PrismaService) {}

  findByProject(projectId: string): Promise<EstimateProjectPhoto[]> {
    return this.prisma.estimateProjectPhoto.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  countByProject(projectId: string): Promise<number> {
    return this.prisma.estimateProjectPhoto.count({ where: { projectId } });
  }

  async createMany(
    data: Prisma.EstimateProjectPhotoCreateManyInput[],
  ): Promise<void> {
    await this.prisma.estimateProjectPhoto.createMany({ data });
  }

  findScoped(
    photoId: string,
    projectId: string,
    companyId: string,
  ): Promise<EstimateProjectPhoto | null> {
    return this.prisma.estimateProjectPhoto.findFirst({
      where: { id: photoId, projectId, project: { companyId } },
    });
  }

  updateCaption(
    photoId: string,
    caption: string | null,
  ): Promise<EstimateProjectPhoto> {
    return this.prisma.estimateProjectPhoto.update({
      where: { id: photoId },
      data: { caption },
    });
  }

  async delete(photoId: string): Promise<void> {
    await this.prisma.estimateProjectPhoto.delete({ where: { id: photoId } });
  }
}
