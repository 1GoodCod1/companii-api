import type { EstimateProjectPhoto, Prisma } from '@prisma/client';

export const ESTIMATE_PROJECT_PHOTO_REPOSITORY = Symbol(
  'EstimateProjectPhotoRepository',
);

export interface EstimateProjectPhotoRepository {
  findByProject(projectId: string): Promise<EstimateProjectPhoto[]>;
  countByProject(projectId: string): Promise<number>;
  createMany(data: Prisma.EstimateProjectPhotoCreateManyInput[]): Promise<void>;
  findScoped(
    photoId: string,
    projectId: string,
    companyId: string,
  ): Promise<EstimateProjectPhoto | null>;
  updateCaption(
    photoId: string,
    caption: string | null,
  ): Promise<EstimateProjectPhoto>;
  delete(photoId: string): Promise<void>;
}
