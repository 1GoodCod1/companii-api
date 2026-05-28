import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { formatEstimateUnitsList, normalizeEstimateUnit } from '../../../../prisma/estimate-measurement-units';
import { assertBlueprintUnitsValid } from '../utils/estimate-unit-validation.util';
import { readEnabledWorkModules } from '../utils/work-modules.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { guessUnit, projectInclude, round2, type EstimateCalculateResult } from '../estimate.constants';
import {
  buildCalculationTrace,
  filterPersistableMeasurements,
  resolveRequiresManualReview,
} from '../utils/estimate-calculation-trace.util';
import {
  RECALCULATED_ESTIMATE_LINE_SOURCES,
  accumulateEstimateLineTotals,
  nextRuleLineSortOrder,
} from '../utils/estimate-line-recalculate.util';
import { EstimatesContextService } from '../context/estimates-context.service';
import {
  EstimatePricingEngine,
  distributeDurationDays,
} from '../pricing/pricing-engine.service';
import type { CustomPricingOverrideResult } from '../pricing/pricing-engine.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';

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
    const cid = this.ctx.companyId(user);
    const config = this.ctx.parseBlueprintConfig(project.blueprint?.config);
    try {
      assertBlueprintUnitsValid(config, `project ${id}`);
    } catch (err) {
      throw AppErrors.badRequest(err instanceof Error ? err.message : 'Invalid blueprint units');
    }
    const plan2d = this.ctx.parsePlan2d(project.sitePlan?.plan2d);
    const diagnostic = (project.diagnosticAnswers ?? {}) as Record<string, unknown>;

    let measurements = this.pricing.deriveMeasurements(plan2d, diagnostic, project.category?.slug);
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
    );
    measurements = customPricing.measurements;
    pricingRules = customPricing.rules;
    const enabledWorkModules = readEnabledWorkModules(diagnostic, config);
    const ruleLines = this.pricing.buildLinesFromRules(pricingRules, measurements, {
      enabledWorkModules,
      config,
    });
    const calculationTrace = buildCalculationTrace(measurements, plan2d, diagnostic);
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
              description: `Manoperă (Volum / Contract) — ${stage.name}`,
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
        } else if (stage.laborHours && stage.laborRate) {
          const hours = Number(stage.laborHours);
          const rate = Number(stage.laborRate);
          const stageDefaultLabor = round2(hours * rate);
          laborCost = round2(laborCost + stageDefaultLabor);
          await tx.estimateLine.create({
            data: {
              stageId: stage.id,
              description: `Manoperă — ${stage.name}`,
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

  async updateLine(
    user: JwtPayload,
    projectId: string,
    stageId: string,
    lineId: string,
    data: {
      description?: string;
      qty?: number;
      unit?: string;
      unitPrice?: number;
      materialStore?: string | null;
      receiptFileKey?: string | null;
    },
  ) {
    this.ctx.assertManagement(user);
    await this.access.findProjectOrThrow(user, projectId);
    const stage = await this.prisma.estimateStage.findFirst({
      where: { id: stageId, projectId },
    });
    if (!stage) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const line = await this.prisma.estimateLine.findFirst({
      where: { id: lineId, stageId },
    });
    if (!line) throw AppErrors.notFound('Estimate line not found');

    const qty = data.qty !== undefined ? data.qty : Number(line.qty);
    const unitPrice = data.unitPrice !== undefined ? data.unitPrice : Number(line.unitPrice);
    const unit = data.unit !== undefined ? this.requireValidUnit(data.unit, 'estimate line') : line.unit;
    const lineTotal = round2(qty * unitPrice);

    return this.prisma.$transaction(async (tx) => {
      // Lock parent project and stage rows FOR UPDATE first to serialize and prevent deadlocks on foreign key constraints
      await tx.$executeRaw`SELECT id FROM estimate_projects WHERE id = ${projectId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM estimate_stages WHERE id = ${stageId} FOR UPDATE`;

      await tx.estimateLine.update({
        where: { id: lineId },
        data: {
          description: data.description?.trim(),
          qty,
          unit,
          unitPrice,
          lineTotal,
          materialStore: data.materialStore === null ? null : data.materialStore?.trim(),
          receiptFileKey: data.receiptFileKey === null ? null : data.receiptFileKey,
        },
      });

      return this.recalcStageTotals(tx, stageId, projectId);
    });
  }

  async addLine(
    user: JwtPayload,
    projectId: string,
    stageId: string,
    data: {
      description: string;
      qty: number;
      unit: string;
      unitPrice: number;
    },
  ) {
    this.ctx.assertManagement(user);
    await this.access.findProjectOrThrow(user, projectId);
    const stage = await this.prisma.estimateStage.findFirst({
      where: { id: stageId, projectId },
    });
    if (!stage) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const lastLine = await this.prisma.estimateLine.findFirst({
      where: { stageId },
      orderBy: { sortOrder: 'desc' },
    });
    const sortOrder = (lastLine?.sortOrder ?? 0) + 1;
    const unit = this.requireValidUnit(data.unit, 'estimate line');
    const lineTotal = round2(data.qty * data.unitPrice);

    return this.prisma.$transaction(async (tx) => {
      // Lock parent project and stage rows FOR UPDATE first to serialize and prevent deadlocks on foreign key constraints
      await tx.$executeRaw`SELECT id FROM estimate_projects WHERE id = ${projectId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM estimate_stages WHERE id = ${stageId} FOR UPDATE`;

      await tx.estimateLine.create({
        data: {
          stageId,
          description: data.description.trim(),
          qty: data.qty,
          unit,
          unitPrice: data.unitPrice,
          lineTotal,
          source: 'manual',
          sortOrder,
        },
      });

      return this.recalcStageTotals(tx, stageId, projectId);
    });
  }

  async deleteLine(
    user: JwtPayload,
    projectId: string,
    stageId: string,
    lineId: string,
  ) {
    this.ctx.assertManagement(user);
    await this.access.findProjectOrThrow(user, projectId);
    const stage = await this.prisma.estimateStage.findFirst({
      where: { id: stageId, projectId },
    });
    if (!stage) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const line = await this.prisma.estimateLine.findFirst({
      where: { id: lineId, stageId },
    });
    if (!line) throw AppErrors.notFound('Estimate line not found');

    return this.prisma.$transaction(async (tx) => {
      // Lock parent project and stage rows FOR UPDATE first to serialize and prevent deadlocks on foreign key constraints
      await tx.$executeRaw`SELECT id FROM estimate_projects WHERE id = ${projectId} FOR UPDATE`;
      await tx.$executeRaw`SELECT id FROM estimate_stages WHERE id = ${stageId} FOR UPDATE`;

      await tx.estimateLine.delete({ where: { id: lineId } });
      return this.recalcStageTotals(tx, stageId, projectId);
    });
  }

  private async recalcStageTotals(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    stageId: string,
    projectId: string,
  ) {
    // Pessimistic locks in consistent order to prevent concurrent stage & project edits causing race conditions in totals
    await tx.$executeRaw`SELECT id FROM estimate_projects WHERE id = ${projectId} FOR UPDATE`;
    await tx.$executeRaw`SELECT id FROM estimate_stages WHERE id = ${stageId} FOR UPDATE`;

    const allLines = await tx.estimateLine.findMany({ where: { stageId } });
    const { laborCost, materialCost } = accumulateEstimateLineTotals(
      allLines.map((line) => ({
        unit: line.unit,
        description: line.description,
        lineTotal: line.lineTotal,
      })),
    );
    const stageTotal = round2(laborCost + materialCost);

    await tx.estimateStage.update({
      where: { id: stageId },
      data: { laborCost, materialCost, stageTotal },
    });

    const project = await tx.estimateProject.findUniqueOrThrow({
      where: { id: projectId },
      include: { stages: true },
    });
    const projectLaborTotal = round2(project.stages.reduce((acc, s) => acc + Number(s.laborCost), 0));
    const projectMaterialTotal = round2(project.stages.reduce((acc, s) => acc + Number(s.materialCost), 0));
    const subtotal = projectLaborTotal + projectMaterialTotal;
    const marginPct = Number(project.marginPct);
    const grandTotal = round2(subtotal * (1 + marginPct / 100));

    const allProjectLines = await tx.estimateLine.findMany({
      where: { stage: { projectId } },
    });
    const tvaAmount = this.calculateTva(
      allProjectLines,
      project.tvaRate,
      marginPct,
    );
    const grandTotalWithVat = round2(grandTotal + tvaAmount);

    await tx.estimateProject.update({
      where: { id: projectId },
      data: {
        laborTotal: projectLaborTotal,
        materialTotal: projectMaterialTotal,
        grandTotal,
        tvaAmount,
        grandTotalWithVat,
      },
    });

    return tx.estimateProject.findUniqueOrThrow({
      where: { id: projectId },
      include: projectInclude,
    });
  }

  private requireValidUnit(raw: string, context: string): string {
    const normalized = normalizeEstimateUnit(raw);
    if (!normalized) {
      throw AppErrors.badRequest(
        `Unitate invalidă "${raw}" (${context}). Permise: ${formatEstimateUnitsList()}.`,
      );
    }
    return normalized;
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
}
