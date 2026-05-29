import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { formatEstimateUnitsList, normalizeEstimateUnit } from '../../../../../prisma/estimate-measurement-units';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { projectInclude, round2 } from '../../estimate.constants';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import {
  accumulateEstimateLineTotals,
  calculateTva,
} from '../../utils/estimate-line-recalculate.util';

@Injectable()
export class EstimateLinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
  ) {}

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
    const riskReservePct = Number(project.riskReservePct ?? 0);
    const grandTotal = round2(subtotal * (1 + riskReservePct / 100) * (1 + marginPct / 100));

    const allProjectLines = await tx.estimateLine.findMany({
      where: { stage: { projectId } },
    });
    const tvaAmount = calculateTva(
      allProjectLines,
      project.tvaRate,
      marginPct,
      riskReservePct,
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
}
