import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus, EstimateStageKind, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { projectInclude, type EstimateProjectUpdateResult, type EstimateProjectDetail, round2 } from '../estimate.constants';
import { EstimatesContextService } from '../context/estimates-context.service';
import { EstimatePricingEngine } from '../pricing/pricing-engine.service';
import type { Plan2dData } from '../pricing/plan2d.types';
import { syncGlobalParamsToDiagnostic } from '../utils/sync-global-params-to-diagnostic.util';
import {
  mergeEnabledWorkModulesIntoDiagnostic,
  readEnabledWorkModules,
  validateEnabledWorkModules,
} from '../utils/work-modules.util';
import {
  type EstimateFieldWarning,
  validateCustomFieldsAnswers,
} from '../utils/estimate-custom-fields-validation.util';
import {
  assertVersionMatch,
  isMutationAlreadyApplied,
  recordAppliedMutation,
} from '../utils/conflict-resolution.util';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import type { EstimateBlueprintConfig } from '../../../../prisma/estimate-blueprints';
import { isEstimateLaborLine, accumulateEstimateLineTotals } from '../utils/estimate-line-recalculate.util';
import { EstimatePdfService } from '../../fsm/pdf/estimate-pdf.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class EstimateProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly pricing: EstimatePricingEngine,
    private readonly access: EstimateProjectAccessService,
    private readonly estimatePdf: EstimatePdfService,
    private readonly email: EmailService,
  ) {}

  list(user: JwtPayload, cursor?: string, limit = 20) {
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
    }).then((items) => {
      if (!cursor) {
        return items as unknown as typeof items | { items: typeof items; nextCursor: string | null };
      }
      return {
        items,
        nextCursor: items.length === take ? items[items.length - 1]?.id : null,
      };
    });
  }

  async get(user: JwtPayload, id: string) {
    const project = await this.access.findProjectOrThrow(user, id);
    if (this.ctx.isTechnician(user)) {
      return this.sanitizeEstimateForTechnician(project);
    }
    return this.computeProjectActualsAndVariance(project);
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
    const number = await this.access.nextProjectNumber(cid);

    return this.prisma.$transaction(async (tx) => {
      const initialDiagnostic = mergeEnabledWorkModulesIntoDiagnostic({}, config);

      const project = await tx.estimateProject.create({
        data: {
          companyId: cid,
          customerId: data.customerId,
          categoryId: data.categoryId,
          blueprintId: blueprint.id,
          number,
          title: data.title?.trim() || `Smetă ${category.name}`,
          siteType: data.siteType,
          address: data.address?.trim() || customer.address,
          validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
          marginPct: config.defaultMarginPct,
          tvaRate: company?.isTvaPayer ? new Prisma.Decimal(20) : null,
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

      await tx.estimateStage.createMany({
        data: config.defaultStages.map((stage, index) => ({
          projectId: project.id,
          sortOrder: index,
          code: stage.code,
          name: stage.name,
          kind: stage.kind as EstimateStageKind,
          description: stage.description,
          laborHours: stage.defaultLaborHours,
          laborRate: stage.defaultLaborRate ?? config.defaultLaborRate,
          checklist: stage.checklist ?? [],
          durationDays: stage.durationDays,
        })),
      });

      return tx.estimateProject.findUniqueOrThrow({
        where: { id: project.id },
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
      validationWarnings = this.validateCustomFields(config, mergedDiagnostic);
    }

    return this.prisma.$transaction(async (tx) => {
      // M-05: idempotent replay — if the offline queue retries the same
      // mutation, return the current state without re-applying.
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

      // M-05 / S-03: optimistic concurrency — only update when the row
      // is still at the version the client saw.
      assertVersionMatch(project.version, data.expectedVersion, {
        number: project.number,
        title: project.title,
      });

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
        diagnosticAnswers: (mergedDiagnostic ?? data.diagnosticAnswers) as Prisma.InputJsonValue,
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
  ): EstimateFieldWarning[] {
    const result = validateCustomFieldsAnswers(config, answers);
    if (!result.ok) {
      throw AppErrors.badRequest({
        code: result.code,
        fields: result.fields,
      });
    }
    return result.warnings;
  }

  computeProjectActualsAndVariance(project: EstimateProjectDetail) {
    let materialBudget = 0;
    let materialActual = 0;
    let materialActualSpent = 0;

    let materialLinesTotal = 0;
    let materialLinesPurchased = 0;
    let materialLinesSkipped = 0;
    let materialLinesPending = 0;

    if (project.stages) {
      for (const stage of project.stages) {
        if (stage.lines) {
          for (const line of stage.lines) {
            const isLabor = isEstimateLaborLine({
              unit: line.unit,
              description: line.description,
            });

            if (!isLabor) {
              materialLinesTotal++;
              const lineTotal = Number(line.lineTotal);
              materialBudget += lineTotal;

              if (line.actualStatus === 'PURCHASED' || line.actualStatus === 'VERIFIED') {
                materialLinesPurchased++;
                const actualLineTotal = Number(line.actualLineTotal ?? 0);
                materialActual += actualLineTotal;
                materialActualSpent += actualLineTotal;
              } else if (line.actualStatus === 'NO_RECEIPT') {
                materialLinesPurchased++;
                const actualLineTotal = Number(line.actualLineTotal ?? 0);
                materialActual += actualLineTotal;
              } else if (line.actualStatus === 'SKIPPED') {
                materialLinesSkipped++;
              } else if (line.actualStatus === 'PENDING') {
                materialLinesPending++;
              }

              const lineWithVariance = line as typeof line & { variancePct?: number | null };
              if (line.actualLineTotal !== null && line.actualLineTotal !== undefined) {
                const variance = Number(line.actualLineTotal) - lineTotal;
                lineWithVariance.variancePct = lineTotal > 0 ? Math.round((variance / lineTotal) * 100 * 100) / 100 : 0;
              } else {
                lineWithVariance.variancePct = null;
              }
            } else {
              (line as typeof line & { variancePct?: number | null }).variancePct = null;
            }
          }
        }
      }
    }

    const materialVariance = Math.round((materialActual - materialBudget) * 100) / 100;
    const materialVariancePct = materialBudget > 0 ? Math.round((materialVariance / materialBudget) * 100 * 100) / 100 : 0;
    const actualsCompletionPct = materialLinesTotal > 0
      ? Math.round(((materialLinesPurchased + materialLinesSkipped) / materialLinesTotal) * 100 * 100) / 100
      : 0;

    return {
      ...project,
      materialBudget: Math.round(materialBudget * 100) / 100,
      materialActual: Math.round(materialActual * 100) / 100,
      materialVariance,
      materialVariancePct,
      materialLinesTotal,
      materialLinesPurchased,
      materialLinesSkipped,
      materialLinesPending,
      actualsCompletionPct,
      materialActualSpent: Math.round(materialActualSpent * 100) / 100,
    };
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

  async lockActuals(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);
    if (project.actualsLockedAt) {
      throw AppErrors.badRequest('Smeta a fost deja blocată ("lock-actuals").');
    }

    const enriched = this.computeProjectActualsAndVariance(project);
    const shouldAlert = enriched.materialVariancePct > 15;
    const actualVariance = enriched.materialVariance;
    const actualVariancePct = enriched.materialVariancePct;

    const result = await this.prisma.$transaction(async (tx) => {
      // Pessimistic lock
      await tx.$executeRaw`SELECT id FROM estimate_projects WHERE id = ${id} FOR UPDATE`;

      const stages = await tx.estimateStage.findMany({
        where: { projectId: id },
        include: { lines: true },
      });

      for (const stage of stages) {
        // Update lines
        const linesToUpdate = stage.lines.filter((l) => l.actualLineTotal !== null);
        for (const line of linesToUpdate) {
          await tx.estimateLine.update({
            where: { id: line.id },
            data: {
              unitPrice: line.actualUnitPrice!,
              lineTotal: line.actualLineTotal!,
              source: 'actual',
            },
          });
        }

        // Recalculate stage totals
        const allStageLines = await tx.estimateLine.findMany({
          where: { stageId: stage.id },
        });

        const { laborCost, materialCost } = accumulateEstimateLineTotals(
          allStageLines.map((line) => ({
            unit: line.unit,
            description: line.description,
            lineTotal: line.lineTotal,
          })),
        );
        const stageTotal = round2(laborCost + materialCost);

        await tx.estimateStage.update({
          where: { id: stage.id },
          data: { laborCost, materialCost, stageTotal },
        });
      }

      // Recalculate project totals
      const updatedStages = await tx.estimateStage.findMany({
        where: { projectId: id },
      });

      const laborTotal = round2(updatedStages.reduce((acc, s) => acc + Number(s.laborCost), 0));
      const materialTotal = round2(updatedStages.reduce((acc, s) => acc + Number(s.materialCost), 0));
      const subtotal = laborTotal + materialTotal;
      const marginPct = Number(project.marginPct);
      const grandTotal = round2(subtotal * (1 + marginPct / 100));

      const allProjectLines = await tx.estimateLine.findMany({
        where: { stage: { projectId: id } },
      });

      const tvaAmount = this.calculateTva(
        allProjectLines,
        project.tvaRate,
        marginPct,
      );
      const grandTotalWithVat = round2(grandTotal + tvaAmount);

      await tx.estimateProject.update({
        where: { id },
        data: {
          laborTotal,
          materialTotal,
          grandTotal,
          tvaAmount,
          grandTotalWithVat,
          actualsLockedAt: new Date(),
          version: { increment: 1 },
        },
      });

      return this.get(user, id);
    });

    if (shouldAlert) {
      const companyId = this.ctx.companyId(user);
      const company = await this.prisma.runOutsideRlsContext(() =>
        this.prisma.company.findUnique({
          where: { id: companyId },
          select: {
            name: true,
            contactEmail: true,
            owner: { select: { email: true } },
            members: {
              where: { status: 'ACTIVE', role: { in: ['OWNER', 'MANAGER'] } },
              select: { user: { select: { email: true } } },
            },
          },
        }),
      );

      if (company) {
        const recipients = [
          company.owner.email,
          company.contactEmail,
          ...company.members.map((m) => m.user.email),
        ].filter((email): email is string => Boolean(email));

        const uniqueRecipients = [...new Set(recipients)];
        for (const to of uniqueRecipients) {
          void this.email.sendEstimateVarianceAlertEmail({
            to,
            estimateNumber: project.number,
            projectName: project.title,
            variance: actualVariance,
            variancePct: actualVariancePct,
          });
        }
      }
    }

    return result;
  }

  async unlockActuals(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    await this.access.findProjectOrThrow(user, id);

    await this.prisma.estimateProject.update({
      where: { id },
      data: {
        actualsLockedAt: null,
        version: { increment: 1 },
      },
    });

    return this.get(user, id);
  }

  private calculateTva(
    lines: Array<{ lineTotal: any; vatRate?: any | null }>,
    projectTvaRate: any | null,
    marginPct: number,
  ): number {
    const marginFactor = 1 + marginPct / 100;
    let tvaAmount = 0;
    for (const line of lines) {
      const rate = line.vatRate !== null && line.vatRate !== undefined ? Number(line.vatRate) : Number(projectTvaRate ?? 0);
      const lineTotal = Number(line.lineTotal);
      const lineTva = lineTotal * marginFactor * (rate / 100);
      tvaAmount += lineTva;
    }
    return round2(tvaAmount);
  }

  async getShoppingList(user: JwtPayload, id: string) {
    const project = await this.access.findProjectOrThrow(user, id);
    const isMember = this.ctx.isTechnician(user);

    // Fetch all lines in PENDING actualStatus
    const lines = await this.prisma.estimateLine.findMany({
      where: {
        stage: { projectId: id },
        actualStatus: 'PENDING',
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Filter out labor lines and group them by materialStore
    const grouped: Record<string, any[]> = {};

    for (const line of lines) {
      const isLabor = isEstimateLaborLine({
        unit: line.unit,
        description: line.description,
      });

      if (!isLabor) {
        const store = line.materialStore?.trim() || 'unassigned';
        if (!grouped[store]) {
          grouped[store] = [];
        }

        grouped[store].push({
          id: line.id,
          description: line.description,
          qty: Number(line.qty),
          unit: line.unit,
          stageId: line.stageId,
          notes: line.actualNotes,
          ...(!isMember ? { estimatedUnitPrice: Number(line.unitPrice) } : {}),
        });
      }
    }

    return grouped;
  }

  async getShoppingListPdfStream(user: JwtPayload, id: string) {
    const project = await this.prisma.estimateProject.findUniqueOrThrow({
      where: { id },
      include: { customer: true },
    });
    const isMember = this.ctx.isTechnician(user);
    const grouped = await this.getShoppingList(user, id);

    const readable = await this.estimatePdf.buildShoppingListStream(project, grouped, isMember);
    return { readable, filename: `shopping-list-${project.number}.pdf` };
  }

  async getVarianceReport(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);

    const enriched = this.computeProjectActualsAndVariance(project);

    const stageReports: Array<{
      id: string;
      name: string;
      sortOrder: number;
      materialBudget: number;
      materialActual: number;
      materialVariance: number;
      materialVariancePct: number;
      lines: Array<{
        id: string;
        description: string;
        kind: 'labor' | 'material';
        budget: number;
        actual: number | null;
        variance: number | null;
        variancePct: number | null;
        actualStatus: string;
      }>;
    }> = [];
    if (project.stages) {
      for (const stage of project.stages) {
        let stageMaterialBudget = 0;
        let stageMaterialActual = 0;
        const lineReports: typeof stageReports[number]['lines'] = [];

        if (stage.lines) {
          for (const line of stage.lines) {
            const isLabor = isEstimateLaborLine({
              unit: line.unit,
              description: line.description,
            });

            const lineBudget = Number(line.lineTotal);
            const lineVariance = line.actualLineTotal !== null ? Number(line.actualLineTotal) - lineBudget : null;
            const lineVariancePct = (lineVariance !== null && lineBudget > 0)
              ? Math.round((lineVariance / lineBudget) * 100 * 100) / 100
              : null;

            if (!isLabor) {
              stageMaterialBudget += lineBudget;
              if (line.actualLineTotal !== null) {
                stageMaterialActual += Number(line.actualLineTotal);
              }
            }

            lineReports.push({
              id: line.id,
              description: line.description,
              kind: isLabor ? 'labor' : 'material',
              budget: lineBudget,
              actual: line.actualLineTotal !== null ? Number(line.actualLineTotal) : null,
              variance: lineVariance,
              variancePct: lineVariancePct,
              actualStatus: line.actualStatus,
            });
          }
        }

        const stageMaterialVariance = stageMaterialActual - stageMaterialBudget;
        const stageMaterialVariancePct = stageMaterialBudget > 0
          ? Math.round((stageMaterialVariance / stageMaterialBudget) * 100 * 100) / 100
          : 0;

        stageReports.push({
          id: stage.id,
          name: stage.name,
          sortOrder: stage.sortOrder,
          materialBudget: round2(stageMaterialBudget),
          materialActual: round2(stageMaterialActual),
          materialVariance: round2(stageMaterialVariance),
          materialVariancePct: stageMaterialVariancePct,
          lines: lineReports,
        });
      }
    }

    const laborBudget = Number(project.laborTotal ?? 0);
    const categories = {
      material: {
        budget: enriched.materialBudget,
        actual: enriched.materialActual,
        variance: enriched.materialVariance,
        variancePct: enriched.materialVariancePct,
      },
      labor: {
        budget: laborBudget,
        actual: laborBudget,
        variance: 0,
        variancePct: 0,
      },
    };

    const companyId = this.ctx.companyId(user);
    const allCompanyProjects = await this.prisma.estimateProject.findMany({
      where: { companyId },
      include: {
        stages: {
          include: { lines: true },
        },
      },
    });

    const mappedProjects = allCompanyProjects
      .map((proj) => {
        const comp = this.computeProjectActualsAndVariance(proj as unknown as EstimateProjectDetail);
        return {
          id: proj.id,
          number: proj.number,
          title: proj.title,
          materialBudget: comp.materialBudget,
          materialActual: comp.materialActual,
          materialVariance: comp.materialVariance,
          materialVariancePct: comp.materialVariancePct,
        };
      })
      .filter((p) => p.materialVariance > 0 && p.id !== id)
      .sort((a, b) => b.materialVariance - a.materialVariance)
      .slice(0, 5);

    return {
      project: {
        id: project.id,
        number: project.number,
        title: project.title,
        status: project.status,
        actualsLockedAt: project.actualsLockedAt,
      },
      metrics: {
        materialBudget: enriched.materialBudget,
        materialActual: enriched.materialActual,
        materialVariance: enriched.materialVariance,
        materialVariancePct: enriched.materialVariancePct,
      },
      stages: stageReports,
      categories,
      topOverruns: mappedProjects,
    };
  }
}
