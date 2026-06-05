import { EstimateProjectStatus, EstimateStageKind, Prisma } from '@prisma/client';
import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprints';
import { mergeEnabledWorkModulesIntoDiagnostic } from '../blueprint/work-modules.util';

export type CreateEstimateProjectParams = {
  companyId: string;
  customerId: string;
  categoryId: string;
  blueprintId: string | null;
  config: EstimateBlueprintConfig;
  number: string;
  title: string;
  address?: string | null;
  siteType?: string | null;
  validUntil?: Date | null;
  isTvaPayer?: boolean;
  groupId?: string | null;
};

export async function createEstimateProjectWithStages(
  tx: Prisma.TransactionClient,
  params: CreateEstimateProjectParams,
): Promise<{ id: string }> {
  const { config } = params;
  const initialDiagnostic = mergeEnabledWorkModulesIntoDiagnostic({}, config);

  const project = await tx.estimateProject.create({
    data: {
      companyId: params.companyId,
      customerId: params.customerId,
      categoryId: params.categoryId,
      blueprintId: params.blueprintId,
      number: params.number,
      title: params.title,
      siteType: params.siteType ?? undefined,
      address: params.address ?? undefined,
      validUntil: params.validUntil ?? undefined,
      groupId: params.groupId ?? undefined,
      marginPct: config.defaultMarginPct,
      tvaRate: params.isTvaPayer ? new Prisma.Decimal(20) : null,
      tvaAmount: new Prisma.Decimal(0),
      grandTotalWithVat: new Prisma.Decimal(0),
      diagnosticAnswers: initialDiagnostic as Prisma.InputJsonValue,
      status: EstimateProjectStatus.DRAFT,
    },
  });

  await tx.estimateSitePlan.create({
    data: {
      projectId: project.id,
      plan2d: { rooms: [], points: [] },
    },
  });

  if (config.defaultStages?.length) {
    await tx.estimateStage.createMany({
      data: config.defaultStages.map((stage, index) => ({
        projectId: project.id,
        sortOrder: index,
        code: stage.code,
        name: stage.name,
        kind: (stage.kind as EstimateStageKind) ?? EstimateStageKind.MIXED,
        description: stage.description,
        laborHours: stage.defaultLaborHours,
        laborRate: stage.defaultLaborRate ?? config.defaultLaborRate,
        checklist: stage.checklist ?? [],
        durationDays: stage.durationDays,
      })),
    });
  }

  return { id: project.id };
}
