import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { FsmContextService } from '../../context/fsm-context.service';

@Injectable()
export class InterventionPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
  ) {}

  async add(user: JwtPayload, interventionId: string, fileKeys: string[]) {
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        id: interventionId,
        companyId: this.ctx.companyId(user),
        ...this.ctx.technicianInterventionFilter(user),
      },
      include: { photos: true },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const startOrder = intervention.photos.length;
    await this.prisma.interventionPhoto.createMany({
      data: fileKeys.map((fileKey, index) => ({
        interventionId,
        fileKey,
        sortOrder: startOrder + index,
      })),
    });

    return this.prisma.interventionPhoto.findMany({
      where: { interventionId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async delete(user: JwtPayload, interventionId: string, photoId: string) {
    const photo = await this.prisma.interventionPhoto.findFirst({
      where: {
        id: photoId,
        interventionId,
        intervention: {
          companyId: this.ctx.companyId(user),
          ...this.ctx.technicianInterventionFilter(user),
        },
      },
    });
    if (!photo) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    await this.prisma.interventionPhoto.delete({ where: { id: photoId } });
    return { success: true };
  }
}
