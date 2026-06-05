import { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';

export type ResolveEstimateGroupParams = {
  companyId: string;
  customerId: string;
  address?: string | null;
  title?: string | null;
  existingGroupId?: string | null;
  anchorProjectId?: string;
};

export async function resolveEstimateGroupId(
  tx: Prisma.TransactionClient,
  params: ResolveEstimateGroupParams,
): Promise<string> {
  if (params.existingGroupId) {
    const group = await tx.estimateGroup.findFirst({
      where: {
        id: params.existingGroupId,
        companyId: params.companyId,
        customerId: params.customerId,
      },
      select: { id: true },
    });
    if (!group) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }
    return group.id;
  }

  const group = await tx.estimateGroup.create({
    data: {
      companyId: params.companyId,
      customerId: params.customerId,
      address: params.address?.trim() || undefined,
      title: params.title?.trim() || undefined,
    },
  });

  if (params.anchorProjectId) {
    await tx.estimateProject.update({
      where: { id: params.anchorProjectId },
      data: { groupId: group.id },
    });
  }

  return group.id;
}
