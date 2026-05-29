import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import type { Plan2dData } from '../../pricing/plan2d.types';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimatePricingEngine } from '../../pricing/pricing-engine.service';
import { EstimateProjectAccessService } from '../../services/projects/estimate-project-access.service';
import { EstimateProjectActualsService } from '../../services/projects/estimate-project-actuals.service';
import { syncGlobalParamsToDiagnostic } from '../../utils/sync-global-params-to-diagnostic.util';
import { mergeEnabledWorkModulesIntoDiagnostic } from '../../utils/work-modules.util';
import {
  assertVersionMatch,
  isMutationAlreadyApplied,
  recordAppliedMutation,
} from '../../utils/conflict-resolution.util';

@Injectable()
export class SaveSitePlanCommandHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly pricing: EstimatePricingEngine,
    private readonly access: EstimateProjectAccessService,
    private readonly actuals: EstimateProjectActualsService,
  ) {}

  async execute(
    user: JwtPayload,
    id: string,
    plan2d: Plan2dData,
    options?: {
      expectedVersion?: number;
      clientMutationId?: string;
      clientDraftId?: string;
    },
  ) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);
    const plan3d = this.pricing.buildPlan3dPreview(plan2d);
    const currentDiag = (project.diagnosticAnswers as Record<string, unknown> | null) ?? {};
    const config = project.blueprint
      ? this.ctx.parseBlueprintConfig(project.blueprint.config)
      : null;
    const syncedDiag = syncGlobalParamsToDiagnostic(plan2d, currentDiag);
    const nextDiagnosticAnswers = config
      ? mergeEnabledWorkModulesIntoDiagnostic(syncedDiag, config)
      : syncedDiag;

    await this.prisma.$transaction(async (tx) => {
      if (
        options?.clientMutationId &&
        (await isMutationAlreadyApplied(tx, id, options.clientMutationId))
      ) {
        return;
      }

      assertVersionMatch(project.version, options?.expectedVersion, {
        number: project.number,
        title: project.title,
      });

      await tx.estimateSitePlan.upsert({
        where: { projectId: id },
        create: {
          projectId: id,
          plan2d: plan2d as unknown as Prisma.InputJsonValue,
          plan3d: plan3d as unknown as Prisma.InputJsonValue,
        },
        update: {
          plan2d: plan2d as unknown as Prisma.InputJsonValue,
          plan3d: plan3d as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });

      await tx.estimateProject.update({
        where: { id },
        data: {
          diagnosticAnswers: nextDiagnosticAnswers as Prisma.InputJsonValue,
          version: { increment: 1 },
          clientMutationId: options?.clientMutationId ?? undefined,
          clientDraftId: options?.clientDraftId ?? undefined,
          ...(project.status === EstimateProjectStatus.DRAFT
            ? { status: EstimateProjectStatus.MEASURED }
            : {}),
        },
      });

      await recordAppliedMutation(tx, id, options?.clientMutationId, 'save-plan', options?.clientDraftId);
    });

    const updated = await this.access.findProjectOrThrow(user, id);
    return this.actuals.computeProjectActualsAndVariance(updated);
  }
}