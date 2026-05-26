import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class EstimateBlueprintsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.estimateBlueprint.findMany({
      where: { isActive: true },
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getByCategorySlug(slug: string) {
    const blueprint = await this.prisma.estimateBlueprint.findFirst({
      where: { category: { slug }, isActive: true },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    if (!blueprint) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return blueprint;
  }
}
