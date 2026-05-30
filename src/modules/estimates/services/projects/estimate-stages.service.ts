import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { assertBlueprintUnitsValid } from '../../utils/estimate-unit-validation.util';
import { readEnabledWorkModules } from '../../utils/work-modules.util';
import {
  resolveAccessDifficultyLaborMultiplier,
  resolveAccessDifficultyLevel,
  resolveAccessDifficultyMaterialMultiplier,
} from '../../utils/access-difficulty.util';
import {
  normalizeUrgency,
  resolveUrgencyLaborMultiplier,
  resolveUrgencyMaterialMultiplier,
} from '../../utils/urgency.util';
import { runSanityChecks } from '../../utils/sanity-checks.util';
import { isEstimateRecalculable } from '../../utils/estimate-status-transitions.util';
import { parseCompanyPricingModifiers } from '../../../../../prisma/estimate-pricing-modifiers';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { guessUnit, projectInclude, round2, type EstimateCalculateResult } from '../../estimate.constants';
import {
  buildCalculationTrace,
  filterPersistableMeasurements,
  resolveRequiresManualReview,
} from '../../utils/estimate-calculation-trace.util';
import {
  RECALCULATED_ESTIMATE_LINE_SOURCES,
  accumulateEstimateLineTotals,
  nextRuleLineSortOrder,
  calculateTva,
} from '../../utils/estimate-line-recalculate.util';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimatePricingEngine } from '../../pricing/pricing-engine.service';
import { distributeDurationDays } from '../../pricing/pricing-engine-utils';
import type { CustomPricingOverrideResult } from '../../pricing/pricing-engine.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprints';

export function isStageDefaultLaborChargeable(
  def: { optional?: boolean; moduleKey?: string } | undefined,
  enabledModules: string[],
  config: EstimateBlueprintConfig,
  measurements: Record<string, number>,
): boolean {
  if (def?.moduleKey && !enabledModules.includes(def.moduleKey)) {
    return false;
  }

  if (!def?.optional) return true;

  const requiresQtyKeys = def.moduleKey
    ? config.workModules?.find((m) => m.key === def.moduleKey)?.requiresQtyKeys
    : undefined;
  if (requiresQtyKeys?.length && requiresQtyKeys.every((key) => (measurements[key] ?? 0) <= 0)) {
    return false;
  }

  return true;
}

@Injectable()
export class EstimateStagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly pricing: EstimatePricingEngine,
    private readonly access: EstimateProjectAccessService,
  ) {}

  async calculate(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);
    if (!isEstimateRecalculable(project.status)) {
      throw AppErrors.badRequest(
        'Smeta nu mai poate fi recalculată în starea curentă (trimisă / acceptată / în execuție).',
      );
    }
    const cid = this.ctx.companyId(user);
    const config = this.ctx.parseBlueprintConfig(project.blueprint?.config);
    try {
      assertBlueprintUnitsValid(config, `project ${id}`);
    } catch (err) {
      throw AppErrors.badRequest(err instanceof Error ? err.message : 'Invalid blueprint units');
    }
    const plan2d = this.ctx.parsePlan2d(project.sitePlan?.plan2d);
    const diagnostic = (project.diagnosticAnswers ?? {}) as Record<string, unknown>;

    const companyForModifiers = await this.prisma.company.findUnique({
      where: { id: cid },
      select: { pricingModifiers: true },
    });
    const pricingModifiers = parseCompanyPricingModifiers(companyForModifiers?.pricingModifiers);

    let measurements = this.pricing.deriveMeasurements(
      plan2d,
      diagnostic,
      project.category?.slug,
      pricingModifiers,
    );
    measurements = this.pricing.applyDiagnosticIncrements(config, measurements, diagnostic);

    const companyServices = await this.prisma.companyService.findMany({
      where: { companyId: cid },
      select: { name: true, defaultPrice: true },
    });
    let pricingRules = this.pricing.applyCompanyRateBook(config.pricingRules, companyServices);
    const customPricing: CustomPricingOverrideResult = this.pricing.applyCustomPricingOverrides(
      config,
      measurements,
      diagnostic,
      pricingRules,
      project.stages,
      project.category?.slug ?? undefined,
    );
    measurements = customPricing.measurements;
    pricingRules = customPricing.rules;
    const enabledWorkModules = readEnabledWorkModules(diagnostic, config);
    const stageDefByCode = new Map(config.defaultStages.map((s) => [s.code, s]));
    const accessLevel = resolveAccessDifficultyLevel(
      (project as { accessDifficulty?: unknown }).accessDifficulty,
      diagnostic,
    );
    const urgencyLevel = normalizeUrgency((project as { urgency?: unknown }).urgency);
    const accessLaborMultiplier = resolveAccessDifficultyLaborMultiplier(config, accessLevel);
    const accessMaterialMultiplier = resolveAccessDifficultyMaterialMultiplier(config, accessLevel);
    const urgencyLaborMultiplier = resolveUrgencyLaborMultiplier(config, urgencyLevel);
    const urgencyMaterialMultiplier = resolveUrgencyMaterialMultiplier(config, urgencyLevel);
    const laborMultiplier = round2(accessLaborMultiplier * urgencyLaborMultiplier);
    const materialMultiplier = round2(accessMaterialMultiplier * urgencyMaterialMultiplier);
    const includeMaterials = diagnostic.materialIncluded !== false;
    const ruleLines = this.pricing.buildLinesFromRules(pricingRules, measurements, {
      enabledWorkModules,
      config,
      laborMultiplier,
      materialMultiplier,
      includeMaterials,
      diagnostic,
    });
    const calculationTrace = buildCalculationTrace(measurements, plan2d, diagnostic);
    const sanityWarnings = runSanityChecks(project.category?.slug, measurements, diagnostic);
    const requiresManualReview = resolveRequiresManualReview(measurements);
    const persistableMeasurements = filterPersistableMeasurements(measurements);

    return this.prisma.$transaction(async (tx) => {
      await tx.estimateMeasurement.deleteMany({ where: { projectId: id } });
      await tx.estimateMeasurement.createMany({
        data: Object.entries(persistableMeasurements).map(([key, value]) => ({
          projectId: id,
          key,
          label: key,
          value,
          unit: guessUnit(key),
        })),
      });

      for (const stage of project.stages) {
        const manualLines = await tx.estimateLine.findMany({
          where: { stageId: stage.id, source: 'manual' },
          orderBy: { sortOrder: 'asc' },
        });

        await tx.estimateLine.deleteMany({
          where: {
            stageId: stage.id,
            source: { in: [...RECALCULATED_ESTIMATE_LINE_SOURCES] },
          },
        });

        const stageLines = ruleLines.filter((line) => line.stageCode === stage.code);
        let { laborCost, materialCost } = accumulateEstimateLineTotals(manualLines);
        let sortOrder = nextRuleLineSortOrder(manualLines);

        if (customPricing.customLaborTotal && project.stages.length) {
          const overrideLabor = round2(customPricing.customLaborTotal / project.stages.length);
          laborCost = round2(laborCost + overrideLabor);
          await tx.estimateLine.create({
            data: {
              stageId: stage.id,
              description: `Cost Lucrări (Volum / Contract) — ${stage.name}`,
              qty: 1,
              unit: 'buc',
              unitPrice: overrideLabor,
              lineTotal: overrideLabor,
              source: 'custom-total-override',
              sortOrder: sortOrder++,
            },
          });

          const materialLines = stageLines.filter((l) => l.kind === 'material');
          if (materialLines.length) {
            await tx.estimateLine.createMany({
              data: materialLines.map((line, index) => ({
                stageId: stage.id,
                description: line.description,
                qty: line.qty,
                unit: line.unit,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
                source: line.source,
                sortOrder: sortOrder + index,
              })),
            });
            for (const line of materialLines) {
              materialCost = round2(materialCost + line.lineTotal);
            }
            sortOrder += materialLines.length;
          }
        } else if (stageLines.length) {
          await tx.estimateLine.createMany({
            data: stageLines.map((line, index) => ({
              stageId: stage.id,
              description: line.description,
              qty: line.qty,
              unit: line.unit,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              source: line.source,
              sortOrder: sortOrder + index,
            })),
          });

          for (const line of stageLines) {
            if (line.kind === 'labor') laborCost = round2(laborCost + line.lineTotal);
            else materialCost = round2(materialCost + line.lineTotal);
          }
        } else if (
          stage.laborHours &&
          stage.laborRate &&
          isStageDefaultLaborChargeable(
            stageDefByCode.get(stage.code),
            enabledWorkModules,
            config,
            measurements,
          )
        ) {
          const hours = Number(stage.laborHours);
          const rate = Number(stage.laborRate);
          const stageDefaultLabor = round2(hours * rate);
          laborCost = round2(laborCost + stageDefaultLabor);
          await tx.estimateLine.create({
            data: {
              stageId: stage.id,
              description: `Cost Lucrări — ${stage.name}`,
              qty: hours,
              unit: 'ore',
              unitPrice: rate,
              lineTotal: stageDefaultLabor,
              source: 'stage-default',
              sortOrder: sortOrder++,
            },
          });
        }

        const stageTotal = round2(laborCost + materialCost);
        await tx.estimateStage.update({
          where: { id: stage.id },
          data: { laborCost, materialCost, stageTotal },
        });
      }

      if (customPricing.customDurationDays) {
        for (const item of distributeDurationDays(customPricing.customDurationDays, project.stages)) {
          await tx.estimateStage.update({
            where: { id: item.id },
            data: { durationDays: item.durationDays },
          });
        }
      }

      if (customPricing.customLaborHours && project.stages.length) {
        const hoursPerStage = round2(customPricing.customLaborHours / project.stages.length);
        for (const stage of project.stages) {
          await tx.estimateStage.update({
            where: { id: stage.id },
            data: {
              laborHours: hoursPerStage,
              laborRate: stage.laborRate ?? config.defaultLaborRate,
            },
          });
        }
      }

      const updatedStages = await tx.estimateStage.findMany({ where: { projectId: id } });
      const laborTotal = round2(updatedStages.reduce((acc, s) => acc + Number(s.laborCost), 0));
      const materialTotal = round2(updatedStages.reduce((acc, s) => acc + Number(s.materialCost), 0));
      const subtotal = laborTotal + materialTotal;
      const marginPct = Number(project.marginPct);
      const riskReservePct = Number(project.riskReservePct ?? 0);
      const grandTotal = round2(subtotal * (1 + riskReservePct / 100) * (1 + marginPct / 100));

      const allProjectLines = await tx.estimateLine.findMany({
        where: { stage: { projectId: id } },
      });
      const tvaAmount = calculateTva(
        allProjectLines,
        project.tvaRate,
        marginPct,
        riskReservePct,
      );
      const grandTotalWithVat = round2(grandTotal + tvaAmount);

      if (project.sourceLead?.estimatedBudget) {
        const budget = Number(project.sourceLead.estimatedBudget);
        if (grandTotal > budget) {
          const diff = round2(grandTotal - budget);
          const diffPct = round2((diff / budget) * 100);
          sanityWarnings.push({
            key: 'budgetExceeded',
            severity: 'warning',
            message: `Costul estimat (${grandTotal.toLocaleString('ro-MD')} MDL) depășește bugetul specificat de client (${budget.toLocaleString('ro-MD')} MDL) cu ${diff.toLocaleString('ro-MD')} MDL (+${diffPct}%).`,
          });
        }
      }

      const expectedVersion = project.version;
      const updateResult = await tx.estimateProject.updateMany({
        where: {
          id,
          version: expectedVersion,
        },
        data: {
          laborTotal,
          materialTotal,
          grandTotal,
          tvaAmount,
          grandTotalWithVat,
          status: EstimateProjectStatus.CALCULATED,
          requiresManualReview,
          calculationTrace: calculationTrace as Prisma.InputJsonValue,
          version: expectedVersion + 1,
        },
      });

      if (updateResult.count === 0) {
        throw AppErrors.conflict('Smeta a fost modificată de un alt utilizator. Vă rugăm să reîncărcați pagina.');
      }

      const updatedProject = await tx.estimateProject.findUnique({
        where: { id },
        include: projectInclude,
      });

      if (!updatedProject) {
        throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
      }

      return {
        ...updatedProject,
        calculationTrace,
        sanityWarnings,
      } satisfies EstimateCalculateResult;
    });
  }

  async updateStage(
    user: JwtPayload,
    projectId: string,
    stageId: string,
    data: {
      name?: string;
      description?: string;
      laborHours?: number;
      laborRate?: number;
      durationDays?: number;
      checklist?: string[];
    },
  ) {
    this.ctx.assertManagement(user);
    await this.access.findProjectOrThrow(user, projectId);
    const stage = await this.prisma.estimateStage.findFirst({
      where: { id: stageId, projectId },
    });
    if (!stage) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.estimateStage.update({
      where: { id: stageId },
      data: {
        name: data.name?.trim(),
        description: data.description?.trim(),
        laborHours: data.laborHours,
        laborRate: data.laborRate,
        durationDays: data.durationDays,
        checklist: data.checklist as Prisma.InputJsonValue,
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
  }
}

