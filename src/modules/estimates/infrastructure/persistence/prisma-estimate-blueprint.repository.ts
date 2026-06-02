import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type {
  BlueprintWithCategory,
  EstimateBlueprintRepository,
} from '../../domain/ports/estimate-blueprint.repository.port';

const blueprintInclude = {
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.EstimateBlueprintInclude;

@Injectable()
export class PrismaEstimateBlueprintRepository
  implements EstimateBlueprintRepository
{
  constructor(private readonly prisma: PrismaService) {}

  findActive(): Promise<BlueprintWithCategory[]> {
    return this.prisma.estimateBlueprint.findMany({
      where: { isActive: true },
      include: blueprintInclude,
      orderBy: { name: 'asc' },
    });
  }

  findActiveByCategorySlug(
    slug: string,
  ): Promise<BlueprintWithCategory | null> {
    return this.prisma.estimateBlueprint.findFirst({
      where: { category: { slug }, isActive: true },
      include: blueprintInclude,
    });
  }
}
