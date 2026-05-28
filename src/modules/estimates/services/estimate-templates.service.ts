import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { EstimatesContextService } from '../context/estimates-context.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CreateTemplateDto, UpdateTemplateDto } from '../dto/template.dto';
import { round2, projectInclude } from '../estimate.constants';
import { accumulateEstimateLineTotals } from '../utils/estimate-line-recalculate.util';

@Injectable()
export class EstimateTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
  ) {}

  list(user: JwtPayload) {
    this.ctx.assertManagement(user);
    const cid = this.ctx.companyId(user);
    return this.prisma.estimateTemplate.findMany({
      where: { companyId: cid },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const cid = this.ctx.companyId(user);
    const template = await this.prisma.estimateTemplate.findFirst({
      where: { id, companyId: cid },
    });
    if (!template) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return template;
  }

  async create(user: JwtPayload, dto: CreateTemplateDto) {
    this.ctx.assertManagement(user);
    const cid = this.ctx.companyId(user);

    let stagesPayload: any[] = dto.stages ?? [];

    if (dto.projectId) {
      const project = await this.prisma.estimateProject.findFirst({
        where: { id: dto.projectId, companyId: cid },
        include: {
          stages: {
            orderBy: { sortOrder: 'asc' },
            include: {
              lines: {
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      });

      if (!project) {
        throw AppErrors.notFound('Estimate project not found or not owned by your company');
      }

      stagesPayload = project.stages.map((stage) => ({
        name: stage.name,
        code: stage.code,
        kind: stage.kind,
        description: stage.description,
        laborHours: stage.laborHours ? Number(stage.laborHours) : null,
        laborRate: stage.laborRate ? Number(stage.laborRate) : null,
        checklist: stage.checklist ?? [],
        durationDays: stage.durationDays,
        lines: stage.lines.map((line) => ({
          description: line.description,
          qty: Number(line.qty),
          unit: line.unit,
          unitPrice: Number(line.unitPrice),
          materialStore: line.materialStore,
          vatRate: line.vatRate ? Number(line.vatRate) : null,
        })),
      }));
    }

    return this.prisma.estimateTemplate.create({
      data: {
        companyId: cid,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        stages: stagesPayload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async update(user: JwtPayload, id: string, dto: UpdateTemplateDto) {
    this.ctx.assertManagement(user);
    const cid = this.ctx.companyId(user);

    const template = await this.prisma.estimateTemplate.findFirst({
      where: { id, companyId: cid },
    });
    if (!template) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.estimateTemplate.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        description: dto.description !== undefined ? dto.description?.trim() ?? null : undefined,
        stages: dto.stages !== undefined ? (dto.stages as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async delete(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    const cid = this.ctx.companyId(user);

    const template = await this.prisma.estimateTemplate.findFirst({
      where: { id, companyId: cid },
    });
    if (!template) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    await this.prisma.estimateTemplate.delete({ where: { id } });
    return { success: true };
  }

  async applyTemplate(
    user: JwtPayload,
    projectId: string,
    templateId: string,
    options?: { mode?: 'overwrite' | 'append' },
  ) {
    this.ctx.assertManagement(user);
    const cid = this.ctx.companyId(user);
    const project = await this.access.findProjectOrThrow(user, projectId);
    const template = await this.prisma.estimateTemplate.findFirst({
      where: { id: templateId, companyId: cid },
    });
    if (!template) throw AppErrors.notFound('Template not found');

    const mode = options?.mode ?? 'overwrite';

    return this.prisma.$transaction(async (tx) => {
      // Pessimistic lock
      await tx.$executeRaw`SELECT id FROM estimate_projects WHERE id = ${projectId} FOR UPDATE`;

      if (mode === 'overwrite') {
        // Delete existing stages
        await tx.estimateStage.deleteMany({ where: { projectId } });
      }

      // Load template stages JSON structure
      const templateStages = (template.stages as any[]) ?? [];

      // Get current max sort order for appending
      let startSortOrder = 0;
      if (mode === 'append') {
        const lastStage = await tx.estimateStage.findFirst({
          where: { projectId },
          orderBy: { sortOrder: 'desc' },
        });
        startSortOrder = (lastStage?.sortOrder ?? -1) + 1;
      }

      for (let i = 0; i < templateStages.length; i++) {
        const tStage = templateStages[i];
        const newStage = await tx.estimateStage.create({
          data: {
            projectId,
            sortOrder: startSortOrder + i,
            code: tStage.code ?? `stage_${i}`,
            name: tStage.name,
            kind: tStage.kind ?? 'MIXED',
            description: tStage.description ?? '',
            laborHours: tStage.laborHours !== null && tStage.laborHours !== undefined ? new Prisma.Decimal(tStage.laborHours) : null,
            laborRate: tStage.laborRate !== null && tStage.laborRate !== undefined ? new Prisma.Decimal(tStage.laborRate) : null,
            checklist: tStage.checklist ?? [],
            durationDays: tStage.durationDays ?? null,
          },
        });

        if (tStage.lines && Array.isArray(tStage.lines)) {
          await tx.estimateLine.createMany({
            data: tStage.lines.map((line: any, lineIdx: number) => ({
              stageId: newStage.id,
              description: line.description,
              qty: new Prisma.Decimal(line.qty ?? 1),
              unit: line.unit ?? 'buc',
              unitPrice: new Prisma.Decimal(line.unitPrice ?? 0),
              lineTotal: new Prisma.Decimal(round2((line.qty ?? 1) * (line.unitPrice ?? 0))),
              source: 'template',
              sortOrder: lineIdx,
              materialStore: line.materialStore ?? null,
              vatRate: line.vatRate !== null && line.vatRate !== undefined ? new Prisma.Decimal(line.vatRate) : null,
            })),
          });
        }
      }

      // Now recalc totals for all stages of the project
      const allStages = await tx.estimateStage.findMany({
        where: { projectId },
        include: { lines: true },
      });

      for (const stage of allStages) {
        const { laborCost, materialCost } = accumulateEstimateLineTotals(
          stage.lines.map((line) => ({
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
        where: { projectId },
      });
      const laborTotal = round2(updatedStages.reduce((acc, s) => acc + Number(s.laborCost), 0));
      const materialTotal = round2(updatedStages.reduce((acc, s) => acc + Number(s.materialCost), 0));
      const subtotal = laborTotal + materialTotal;
      const marginPct = Number(project.marginPct);
      const riskReservePct = Number(project.riskReservePct ?? 0);
      const grandTotal = round2(subtotal * (1 + riskReservePct / 100) * (1 + marginPct / 100));

      const allProjectLines = await tx.estimateLine.findMany({
        where: { stage: { projectId } },
      });
      const priceFactor = (1 + riskReservePct / 100) * (1 + marginPct / 100);
      let tvaAmount = 0;
      for (const line of allProjectLines) {
        const rate =
          line.vatRate !== null && line.vatRate !== undefined ? Number(line.vatRate) : Number(project.tvaRate ?? 0);
        const lineTotal = Number(line.lineTotal);
        const lineTva = lineTotal * priceFactor * (rate / 100);
        tvaAmount += lineTva;
      }
      tvaAmount = round2(tvaAmount);
      const grandTotalWithVat = round2(grandTotal + tvaAmount);

      await tx.estimateProject.update({
        where: { id: projectId },
        data: {
          laborTotal,
          materialTotal,
          grandTotal,
          tvaAmount,
          grandTotalWithVat,
          status: EstimateProjectStatus.CALCULATED,
          version: { increment: 1 },
        },
      });

      return tx.estimateProject.findUniqueOrThrow({
        where: { id: projectId },
        include: projectInclude,
      });
    });
  }
}
