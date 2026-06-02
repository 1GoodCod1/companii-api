import { Inject, Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import { ESTIMATE_PROJECT_PHOTO_REPOSITORY } from '../../domain/ports/estimate-project-photo.repository.port';
import type { PrismaEstimateProjectPhotoRepository } from '../../infrastructure/persistence/prisma-estimate-project-photo.repository';

@Injectable()
export class EstimateProjectPhotosService {
  constructor(
    @Inject(ESTIMATE_PROJECT_PHOTO_REPOSITORY)
    private readonly photoRepo: PrismaEstimateProjectPhotoRepository,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
  ) {}

  async list(user: JwtPayload, projectId: string) {
    await this.access.findProjectOrThrow(user, projectId);
    return this.photoRepo.findByProject(projectId);
  }

  async add(
    user: JwtPayload,
    projectId: string,
    fileKeys: string[],
    caption?: string,
  ) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, projectId);

    const existingCount = await this.photoRepo.countByProject(project.id);

    await this.photoRepo.createMany(
      fileKeys.map((fileKey, index) => ({
        projectId: project.id,
        fileKey,
        caption: caption ?? null,
        sortOrder: existingCount + index,
        createdById: user.sub,
      })),
    );

    return this.photoRepo.findByProject(project.id);
  }

  async updateCaption(
    user: JwtPayload,
    projectId: string,
    photoId: string,
    caption: string | null,
  ) {
    this.ctx.assertManagement(user);
    const photo = await this.photoRepo.findScoped(
      photoId,
      projectId,
      this.ctx.companyId(user),
    );
    if (!photo) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.photoRepo.updateCaption(photoId, caption?.trim() || null);
  }

  async delete(user: JwtPayload, projectId: string, photoId: string) {
    this.ctx.assertManagement(user);
    const photo = await this.photoRepo.findScoped(
      photoId,
      projectId,
      this.ctx.companyId(user),
    );
    if (!photo) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    await this.photoRepo.delete(photoId);
    return { success: true };
  }
}
