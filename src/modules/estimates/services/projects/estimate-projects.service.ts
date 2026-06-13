import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { projectInclude, type EstimateProjectUpdateResult, type EstimateProjectDetail, round2 } from '../../estimate.constants';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimatePricingEngine } from '../../pricing/pricing-engine.service';
import type { Plan2dData } from '../../pricing/plan2d.types';
import { syncGlobalParamsToDiagnostic } from '../../utils/project/sync-global-params-to-diagnostic.util';
import { createEstimateProjectWithStages } from '../../utils/project/create-estimate-project.util';
import {
  mergeEnabledWorkModulesIntoDiagnostic,
  readEnabledWorkModules,
  validateEnabledWorkModules,
} from '../../utils/blueprint/work-modules.util';
import {
  type EstimateFieldWarning,
  validateCustomFieldsAnswers,
} from '../../utils/blueprint/estimate-custom-fields-validation.util';
import {
  assertVersionMatch,
  isMutationAlreadyApplied,
  recordAppliedMutation,
} from '../../utils/project/conflict-resolution.util';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import { toCursorPage } from '../../../../common/utils/cursor-page.util';
import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprints';
import { EstimateProjectActualsService } from './estimate-project-actuals.service';

@Injectable()
export class EstimateProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly pricing: EstimatePricingEngine,
    private readonly access: EstimateProjectAccessService,
    private readonly actuals: EstimateProjectActualsService,
  ) {}

  async list(user: JwtPayload, cursor?: string, limit = 20) {
    this.ctx.assertManagement(user);
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.estimateProject.findMany({
      where: { companyId: this.ctx.companyId(user) },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        createdAt: true,
        grandTotal: true,
        grandTotalWithVat: true,
        customer: { select: { id: true, fullName: true, phone: true } },
        category: { select: { id: true, name: true, slug: true } },
        quote: { select: { id: true, number: true, status: true } },
        stages: { select: { id: true, name: true, sortOrder: true, stageTotal: true } },
      },
      orderBy: { createdAt: 'desc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take,
    }).then((items) => toCursorPage(items, take));
  }

  async get(user: JwtPayload, id: string) {
    const project = await this.access.findProjectOrThrow(user, id);
    if (this.ctx.isTechnician(user)) {
      return this.sanitizeEstimateForTechnician(project);
    }
    return this.actuals.computeProjectActualsAndVariance(project);
  }

  async create(
    user: JwtPayload,
    data: {
      customerId: string;
      categoryId: string;
      title?: string;
      siteType?: string;
      address?: string;
      validUntil?: string;
    },
  ) {
    this.ctx.assertManagement(user);
    const cid = this.ctx.companyId(user);

    const [customer, category, blueprint, company] = await this.prisma.inSerial([
      () =>
        this.prisma.companyCustomer.findFirst({
          where: { id: data.customerId, companyId: cid },
        }),
      () => this.prisma.category.findUnique({ where: { id: data.categoryId } }),
      () =>
        this.prisma.estimateBlueprint.findFirst({
          where: { categoryId: data.categoryId, isActive: true },
        }),
      () => this.prisma.company.findUnique({ where: { id: cid } }),
    ]);

    if (!customer) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (!category) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (!blueprint) throw AppErrors.notFound('Blueprint not found for category');

    const config = this.ctx.parseBlueprintConfig(blueprint.config);

    return this.prisma.$transaction(async (tx) => {
      const number = await this.access.nextProjectNumber(tx, cid);
      const initialDiagnostic = mergeEnabledWorkModulesIntoDiagnostic({}, config);
      const { id } = await createEstimateProjectWithStages(tx, {
        companyId: cid,
        customerId: data.customerId,
        categoryId: data.categoryId,
        blueprintId: blueprint.id,
        config,
        number,
        title: data.title?.trim() || `Calcul de preț ${category.name}`,
        siteType: data.siteType,
        address: data.address?.trim() || customer.address,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
        isTvaPayer: company?.isTvaPayer ?? false,
      });

      return tx.estimateProject.findUniqueOrThrow({
        where: { id },
        include: projectInclude,
      });
    });
  }

  async update(
    user: JwtPayload,
    id: string,
    data: {
      title?: string;
      siteType?: string;
      address?: string;
      validUntil?: string | null;
      marginPct?: number;
      riskReservePct?: number;
      siteFloor?: number | null;
      accessDifficulty?: string | null;
      urgency?: string | null;
      diagnosticAnswers?: Record<string, unknown>;
      notes?: string | null;
      status?: EstimateProjectStatus;
      // M-05: conflict resolution metadata
      expectedVersion?: number;
      clientMutationId?: string;
      clientDraftId?: string;
    },
  ): Promise<EstimateProjectUpdateResult> {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);

    let mergedDiagnostic: Record<string, unknown> | undefined;
    let validationWarnings: EstimateFieldWarning[] = [];
    if (data.diagnosticAnswers && project.blueprint) {
      const config = this.ctx.parseBlueprintConfig(project.blueprint.config);
      mergedDiagnostic = mergeEnabledWorkModulesIntoDiagnostic(data.diagnosticAnswers, config);
      try {
        validateEnabledWorkModules(config, readEnabledWorkModules(mergedDiagnostic, config));
      } catch (err) {
        throw AppErrors.badRequest(err instanceof Error ? err.message : 'Invalid work modules');
      }
      validationWarnings = this.validateCustomFields(config, mergedDiagnostic, { ignoreRequired: true });
    }

    return this.prisma.$transaction(async (tx) => {
      if (
        data.clientMutationId &&
        (await isMutationAlreadyApplied(tx, id, data.clientMutationId))
      ) {
        const current = await tx.estimateProject.findUniqueOrThrow({
          where: { id },
          include: projectInclude,
        });
        return { ...current, warnings: validationWarnings };
      }
      assertVersionMatch(project.version, data.expectedVersion, {
        number: project.number,
        title: project.title,
      });

      const nextDiagnostic = (mergedDiagnostic ?? data.diagnosticAnswers) as Record<string, unknown> | undefined;
      if (nextDiagnostic && project.diagnosticAnswers && typeof project.diagnosticAnswers === 'object') {
        const prevDiag = project.diagnosticAnswers as Record<string, unknown>;
        if (prevDiag._deletedAutoLines) {
          nextDiagnostic._deletedAutoLines = prevDiag._deletedAutoLines;
        }
      }

      const updateData: Prisma.EstimateProjectUpdateInput = {
        title: data.title?.trim(),
        siteType: data.siteType,
        address: data.address?.trim(),
        validUntil:
          data.validUntil === null
            ? null
            : data.validUntil
              ? new Date(data.validUntil)
              : undefined,
        marginPct: data.marginPct,
        riskReservePct: data.riskReservePct,
        siteFloor: data.siteFloor,
        accessDifficulty:
          data.accessDifficulty === null ? null : data.accessDifficulty?.trim() || undefined,
        urgency: data.urgency === null ? null : data.urgency?.trim() || undefined,
        diagnosticAnswers: nextDiagnostic ? (nextDiagnostic as Prisma.InputJsonValue) : undefined,
        notes: data.notes === null ? null : data.notes?.trim(),
        status: data.status,
        version: { increment: 1 },
        clientMutationId: data.clientMutationId ?? undefined,
        clientDraftId: data.clientDraftId ?? undefined,
      };

      const updated = await tx.estimateProject.update({
        where: { id },
        data: updateData,
        include: projectInclude,
      });

      await recordAppliedMutation(
        tx,
        id,
        data.clientMutationId,
        'update-project',
        data.clientDraftId,
      );

      return { ...updated, warnings: validationWarnings };
    });
  }

  async saveSitePlan(
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
      // M-05: idempotent replay short-circuit
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

      await recordAppliedMutation(
        tx,
        id,
        options?.clientMutationId,
        'save-plan',
        options?.clientDraftId,
      );
    });

    return this.get(user, id);
  }

  async delete(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);
    if (project.status === EstimateProjectStatus.IN_EXECUTION) {
      throw AppErrors.badRequest('Cannot delete estimate in execution');
    }
    await this.prisma.estimateProject.delete({ where: { id } });
    return { success: true };
  }

  validateCustomFields(
    config: EstimateBlueprintConfig,
    answers: Record<string, unknown>,
    options?: { ignoreRequired?: boolean },
  ): EstimateFieldWarning[] {
    const result = validateCustomFieldsAnswers(config, answers, options);
    if (!result.ok) {
      throw AppErrors.badRequest({
        code: result.code,
        fields: result.fields,
      });
    }
    return result.warnings;
  }

  private sanitizeEstimateForTechnician(project: EstimateProjectDetail) {
    return {
      id: project.id,
      number: project.number,
      title: project.title,
      status: project.status,
      siteType: project.siteType,
      address: project.address,
      notes: project.notes,
      createdAt: project.createdAt,
      customer: {
        fullName: project.customer?.fullName,
        phone: project.customer?.phone,
        address: project.customer?.address,
      },
      category: {
        name: project.category?.name,
        slug: project.category?.slug,
      },
      sitePlan: project.sitePlan,
      measurements: project.measurements?.map((m) => ({
        key: m.key,
        label: m.label,
        value: m.value,
        unit: m.unit,
      })),
      stages: project.stages?.map((stage) => ({
        id: stage.id,
        name: stage.name,
        code: stage.code,
        kind: stage.kind,
        description: stage.description,
        durationDays: stage.durationDays,
        checklist: stage.checklist,
        lines: stage.lines?.map((line) => ({
          id: line.id,
          description: line.description,
          qty: line.qty,
          unit: line.unit,
          source: line.source,
          materialStore: line.materialStore,
          actualUnitPrice: line.actualUnitPrice,
          actualQty: line.actualQty,
          actualLineTotal: line.actualLineTotal,
          actualNotes: line.actualNotes,
          actualStatus: line.actualStatus,
          receiptId: line.receiptId,
        })),
      })),
    };
  }

}
