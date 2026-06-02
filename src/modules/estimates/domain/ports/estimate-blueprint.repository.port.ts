import type { Prisma } from '@prisma/client';

export const ESTIMATE_BLUEPRINT_REPOSITORY = Symbol(
  'EstimateBlueprintRepository',
);

export type BlueprintWithCategory = Prisma.EstimateBlueprintGetPayload<{
  include: { category: { select: { id: true; name: true; slug: true } } };
}>;

export interface EstimateBlueprintRepository {
  findActive(): Promise<BlueprintWithCategory[]>;
  findActiveByCategorySlug(
    slug: string,
  ): Promise<BlueprintWithCategory | null>;
}
