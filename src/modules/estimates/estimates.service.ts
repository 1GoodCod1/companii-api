import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EstimateProjectStatus,
  EstimateStageKind,
  Prisma,
  QuoteStatus,
} from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import type { EstimateBlueprintConfig } from '../../../prisma/estimate-blueprints';
import { PrismaService } from '../shared/database/prisma.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { EmailService } from '../email/email.service';
import { CompanyAuthorizationService } from '../companies/company-authorization.service';
import { EstimatePdfService } from '../fsm/estimate-pdf.service';
import {
  EstimatePricingEngine,
  distributeDurationDays,
} from './pricing-engine.service';
import type {
  Plan2dData,
  CustomPricingOverrideResult,
} from './pricing-engine.service';

const projectInclude = {
  customer: true,
  category: true,
  blueprint: true,
  sitePlan: true,
  quote: true,
  measurements: { orderBy: { key: 'asc' as const } },
  stages: {
    orderBy: { sortOrder: 'asc' as const },
    include: { lines: { orderBy: { sortOrder: 'asc' as const } } },
  },
} satisfies Prisma.EstimateProjectInclude;

@Injectable()
export class EstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: EstimatePricingEngine,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly companyAuth: CompanyAuthorizationService,
    private readonly estimatePdf: EstimatePdfService,
  ) {}

  private companyId(user: JwtPayload) {
    if (!user.activeCompanyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }
    return user.activeCompanyId;
  }

  private isTechnician(user: JwtPayload) {
    return user.companyRole === 'MEMBER';
  }

  private assertManagement(user: JwtPayload) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
  }

  private parseBlueprintConfig(raw: unknown): EstimateBlueprintConfig {
    return raw as EstimateBlueprintConfig;
  }

  private parsePlan2d(raw: unknown): Plan2dData | null {
    if (!raw || typeof raw !== 'object') return null;
    return raw as Plan2dData;
  }

  listBlueprints() {
    return this.prisma.estimateBlueprint.findMany({
      where: { isActive: true },
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getBlueprintByCategorySlug(slug: string) {
    const blueprint = await this.prisma.estimateBlueprint.findFirst({
      where: { category: { slug }, isActive: true },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
    if (!blueprint) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return blueprint;
  }

  listProjects(user: JwtPayload) {
    this.assertManagement(user);
    return this.prisma.estimateProject.findMany({
      where: { companyId: this.companyId(user) },
      include: {
        customer: true,
        category: true,
        quote: { select: { id: true, number: true, status: true } },
        stages: { select: { id: true, name: true, sortOrder: true, stageTotal: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProject(user: JwtPayload, id: string) {
    const project = await this.findProjectOrThrow(user, id);
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    return project;
  }

  async createProject(
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
    this.assertManagement(user);
    const cid = this.companyId(user);

    const [customer, category, blueprint] = await this.prisma.inSerial([
      () =>
        this.prisma.companyCustomer.findFirst({
          where: { id: data.customerId, companyId: cid },
        }),
      () => this.prisma.category.findUnique({ where: { id: data.categoryId } }),
      () =>
        this.prisma.estimateBlueprint.findFirst({
          where: { categoryId: data.categoryId, isActive: true },
        }),
    ]);

    if (!customer) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (!category) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (!blueprint) throw AppErrors.notFound('Blueprint not found for category');

    const config = this.parseBlueprintConfig(blueprint.config);
    const number = await this.nextProjectNumber(cid);

    return this.prisma.$transaction(async (tx) => {
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

  async updateProject(
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
    },
  ) {
    this.assertManagement(user);
    await this.findProjectOrThrow(user, id);

    return this.prisma.estimateProject.update({
      where: { id },
      data: {
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
        diagnosticAnswers: data.diagnosticAnswers as Prisma.InputJsonValue,
        notes: data.notes === null ? null : data.notes?.trim(),
        status: data.status,
      },
      include: projectInclude,
    });
  }

  async saveSitePlan(user: JwtPayload, id: string, plan2d: Plan2dData) {
    this.assertManagement(user);
    const project = await this.findProjectOrThrow(user, id);
    const plan3d = this.pricing.buildPlan3dPreview(plan2d);

    await this.prisma.estimateSitePlan.upsert({
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

    if (project.status === EstimateProjectStatus.DRAFT) {
      await this.prisma.estimateProject.update({
        where: { id },
        data: { status: EstimateProjectStatus.MEASURED },
      });
    }

    return this.getProject(user, id);
  }

  async calculateProject(user: JwtPayload, id: string) {
    this.assertManagement(user);
    const project = await this.findProjectOrThrow(user, id);
    const cid = this.companyId(user);
    const config = this.parseBlueprintConfig(project.blueprint?.config);
    const plan2d = this.parsePlan2d(project.sitePlan?.plan2d);
    const diagnostic = (project.diagnosticAnswers ?? {}) as Record<string, unknown>;

    let measurements = this.pricing.deriveMeasurements(plan2d, diagnostic);
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
    const ruleLines = this.pricing.buildLinesFromRules(pricingRules, measurements);

    return this.prisma.$transaction(async (tx) => {
      await tx.estimateMeasurement.deleteMany({ where: { projectId: id } });
      await tx.estimateMeasurement.createMany({
        data: Object.entries(measurements).map(([key, value]) => ({
          projectId: id,
          key,
          label: key,
          value,
          unit: guessUnit(key),
        })),
      });

      for (const stage of project.stages) {
        await tx.estimateLine.deleteMany({ where: { stageId: stage.id } });
        const stageLines = ruleLines.filter((line) => line.stageCode === stage.code);
        let laborCost = 0;
        let materialCost = 0;

        if (customPricing.customLaborTotal && project.stages.length) {
          laborCost = round2(customPricing.customLaborTotal / project.stages.length);
          await tx.estimateLine.create({
            data: {
              stageId: stage.id,
              description: `Manoperă (Volum / Contract) — ${stage.name}`,
              qty: 1,
              unit: 'volum',
              unitPrice: laborCost,
              lineTotal: laborCost,
              source: 'custom-total-override',
              sortOrder: 0,
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
                sortOrder: index + 1,
              })),
            });
            for (const line of materialLines) {
              materialCost += line.lineTotal;
            }
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
              sortOrder: index,
            })),
          });

          for (const line of stageLines) {
            if (line.kind === 'labor') laborCost += line.lineTotal;
            else materialCost += line.lineTotal;
          }
        } else if (stage.laborHours && stage.laborRate) {
          const hours = Number(stage.laborHours);
          const rate = Number(stage.laborRate);
          laborCost = round2(hours * rate);
          await tx.estimateLine.create({
            data: {
              stageId: stage.id,
              description: `Manoperă — ${stage.name}`,
              qty: hours,
              unit: 'ore',
              unitPrice: rate,
              lineTotal: laborCost,
              source: 'stage-default',
              sortOrder: 0,
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

      return tx.estimateProject.update({
        where: { id },
        data: {
          laborTotal,
          materialTotal,
          grandTotal,
          status: EstimateProjectStatus.CALCULATED,
        },
        include: projectInclude,
      });
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
    this.assertManagement(user);
    await this.findProjectOrThrow(user, projectId);
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
    this.assertManagement(user);
    await this.findProjectOrThrow(user, projectId);
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
    const lineTotal = round2(qty * unitPrice);

    return this.prisma.$transaction(async (tx) => {
      await tx.estimateLine.update({
        where: { id: lineId },
        data: {
          description: data.description?.trim(),
          qty,
          unit: data.unit,
          unitPrice,
          lineTotal,
          materialStore: data.materialStore === null ? null : data.materialStore?.trim(),
          receiptFileKey: data.receiptFileKey === null ? null : data.receiptFileKey,
        },
      });

      const allLines = await tx.estimateLine.findMany({ where: { stageId } });
      let laborCost = 0;
      let materialCost = 0;
      for (const l of allLines) {
        const isLabor =
          l.unit === 'ore' ||
          l.unit === 'h' ||
          l.description.toLowerCase().includes('manoperă') ||
          l.description.toLowerCase().includes('manopera');
        if (isLabor) laborCost += Number(l.lineTotal);
        else materialCost += Number(l.lineTotal);
      }
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

      await tx.estimateProject.update({
        where: { id: projectId },
        data: {
          laborTotal: projectLaborTotal,
          materialTotal: projectMaterialTotal,
          grandTotal,
        },
      });

      return tx.estimateProject.findUniqueOrThrow({
        where: { id: projectId },
        include: projectInclude,
      });
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
    this.assertManagement(user);
    await this.findProjectOrThrow(user, projectId);
    const stage = await this.prisma.estimateStage.findFirst({
      where: { id: stageId, projectId },
    });
    if (!stage) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const lastLine = await this.prisma.estimateLine.findFirst({
      where: { stageId },
      orderBy: { sortOrder: 'desc' },
    });
    const sortOrder = (lastLine?.sortOrder ?? 0) + 1;
    const lineTotal = round2(data.qty * data.unitPrice);

    return this.prisma.$transaction(async (tx) => {
      await tx.estimateLine.create({
        data: {
          stageId,
          description: data.description.trim(),
          qty: data.qty,
          unit: data.unit,
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
    this.assertManagement(user);
    await this.findProjectOrThrow(user, projectId);
    const stage = await this.prisma.estimateStage.findFirst({
      where: { id: stageId, projectId },
    });
    if (!stage) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const line = await this.prisma.estimateLine.findFirst({
      where: { id: lineId, stageId },
    });
    if (!line) throw AppErrors.notFound('Estimate line not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.estimateLine.delete({ where: { id: lineId } });

      return this.recalcStageTotals(tx, stageId, projectId);
    });
  }

  /** Shared helper: recalculate stage + project totals after line changes */
  private async recalcStageTotals(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    stageId: string,
    projectId: string,
  ) {
    const allLines = await tx.estimateLine.findMany({ where: { stageId } });
    let laborCost = 0;
    let materialCost = 0;
    for (const l of allLines) {
      const isLabor =
        l.unit === 'ore' ||
        l.unit === 'h' ||
        l.description.toLowerCase().includes('manoperă') ||
        l.description.toLowerCase().includes('manopera');
      if (isLabor) laborCost += Number(l.lineTotal);
      else materialCost += Number(l.lineTotal);
    }
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

    await tx.estimateProject.update({
      where: { id: projectId },
      data: {
        laborTotal: projectLaborTotal,
        materialTotal: projectMaterialTotal,
        grandTotal,
      },
    });

    return tx.estimateProject.findUniqueOrThrow({
      where: { id: projectId },
      include: projectInclude,
    });
  }

  async generateQuote(user: JwtPayload, id: string) {
    this.assertManagement(user);
    let project = await this.findProjectOrThrow(user, id);
    if (project.quoteId) {
      throw AppErrors.conflict('Quote already generated for this estimate');
    }
    if (
      project.status !== EstimateProjectStatus.CALCULATED &&
      project.status !== EstimateProjectStatus.APPROVED
    ) {
      project = await this.calculateProject(user, id);
    }

    const cid = this.companyId(user);

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.quote.count({ where: { companyId: cid } });
      let number = `QTE-${String(count + 1).padStart(5, '0')}`;
      for (let attempt = 0; attempt < 15; attempt++) {
        const exists = await tx.quote.findUnique({ where: { number } });
        if (!exists) break;
        number = `QTE-${String(count + 1 + attempt).padStart(5, '0')}`;
      }

      const lines = project.stages.flatMap((stage) =>
        stage.lines.map((line) => ({
          description: `[${stage.name}] ${line.description}`,
          qty: Number(line.qty),
          unitPrice: Number(line.unitPrice),
        })),
      );

      const total = lines.reduce((acc, line) => acc + line.qty * line.unitPrice, 0);
      const quote = await tx.quote.create({
        data: {
          companyId: cid,
          customerId: project.customerId,
          number,
          total,
          validUntil: project.validUntil ?? undefined,
          status: QuoteStatus.DRAFT,
          lines: { create: lines },
        },
      });

      return tx.estimateProject.update({
        where: { id },
        data: {
          quoteId: quote.id,
          status: EstimateProjectStatus.APPROVED,
        },
        include: projectInclude,
      });
    });
  }

  async sendToClient(user: JwtPayload, id: string) {
    this.assertManagement(user);
    const project = await this.findProjectOrThrow(user, id);
    if (
      project.status !== EstimateProjectStatus.CALCULATED &&
      project.status !== EstimateProjectStatus.APPROVED &&
      project.status !== EstimateProjectStatus.SENT
    ) {
      throw AppErrors.badRequest('Calculați smeta înainte de trimitere.');
    }

    const updated = await this.prisma.estimateProject.update({
      where: { id },
      data: { status: EstimateProjectStatus.SENT },
      include: projectInclude,
    });

    const frontendUrl = this.config.get<string>('frontendUrl') || 'http://localhost:5174';
    const portalUrl = `${frontendUrl}/portal/smete`;

    if (project.customer.email) {
      const company = await this.prisma.runOutsideRlsContext(() =>
        this.prisma.company.findUnique({
          where: { id: this.companyId(user) },
          select: { name: true },
        }),
      );
      void this.email.sendEstimateEmail({
        to: project.customer.email,
        companyName: company?.name ?? 'Companie',
        estimateNumber: project.number,
        title: project.title,
        total: Number(project.grandTotal),
        portalUrl,
      });
    }

    return { project: updated, emailSent: !!project.customer.email };
  }

  async updatePortalEstimateStatus(
    customerId: string,
    projectId: string,
    status: 'ACCEPTED' | 'REJECTED',
  ) {
    const project = await this.prisma.estimateProject.findFirst({
      where: { id: projectId, customerId, status: EstimateProjectStatus.SENT },
      include: {
        customer: { select: { fullName: true } },
        company: {
          select: {
            name: true,
            contactEmail: true,
            owner: { select: { email: true } },
          },
        },
      },
    });
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const updated = await this.prisma.estimateProject.update({
      where: { id: projectId },
      data: {
        status:
          status === 'ACCEPTED'
            ? EstimateProjectStatus.ACCEPTED
            : EstimateProjectStatus.CANCELLED,
      },
    });

    const notifyEmail = project.company.contactEmail ?? project.company.owner.email;
    if (notifyEmail) {
      void this.email.sendEstimateStatusEmail({
        to: notifyEmail,
        companyName: project.company.name,
        estimateNumber: project.number,
        title: project.title,
        clientName: project.customer.fullName,
        status,
        total: Number(project.grandTotal),
      });
    }

    return updated;
  }

  async convertToInterventions(
    user: JwtPayload,
    id: string,
    mode: 'single' | 'by-stage' = 'single',
  ) {
    this.assertManagement(user);
    const project = await this.findProjectOrThrow(user, id);
    const cid = this.companyId(user);

    if (project.status !== EstimateProjectStatus.ACCEPTED) {
      throw AppErrors.badRequest('Smeta trebuie acceptată de client înainte de convertire.');
    }

    const additional = mode === 'by-stage' ? project.stages.length : 1;
    await this.companyAuth.assertInterventionMonthlyLimit(cid, additional);

    if (mode === 'by-stage') {
      return this.prisma.$transaction(async (tx) => {
        const interventions: Awaited<ReturnType<typeof tx.intervention.create>>[] = [];
        for (const stage of project.stages) {
          const intNumber = await this.nextInterventionNumber(tx, cid);
          const intervention = await tx.intervention.create({
            data: {
              companyId: cid,
              customerId: project.customerId,
              number: intNumber,
              type: project.category.name,
              description: `${stage.name}\n${stage.description ?? ''}`.trim(),
              address: project.address ?? project.customer.address,
              estimatedPrice: stage.stageTotal,
              estimateProjectId: project.id,
              estimateStageId: stage.id,
              status: 'NEW',
            },
          });
          interventions.push(intervention);
        }

        await tx.estimateProject.update({
          where: { id },
          data: { status: EstimateProjectStatus.IN_EXECUTION },
        });

        return { interventions };
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const intNumber = await this.nextInterventionNumber(tx, cid);
      const description = project.stages
        .map((s) => `• ${s.name} (${Number(s.stageTotal)} MDL)`)
        .join('\n');

      const intervention = await tx.intervention.create({
        data: {
          companyId: cid,
          customerId: project.customerId,
          number: intNumber,
          type: project.category.name,
          description: `Din smetă ${project.number}:\n${description}`,
          address: project.address ?? project.customer.address,
          estimatedPrice: project.grandTotal,
          estimateProjectId: project.id,
          status: 'NEW',
        },
      });

      await tx.estimateProject.update({
        where: { id },
        data: { status: EstimateProjectStatus.IN_EXECUTION },
      });

      return { intervention };
    });
  }

  async deleteProject(user: JwtPayload, id: string) {
    this.assertManagement(user);
    const project = await this.findProjectOrThrow(user, id);
    if (project.status === EstimateProjectStatus.IN_EXECUTION) {
      throw AppErrors.badRequest('Cannot delete estimate in execution');
    }
    await this.prisma.estimateProject.delete({ where: { id } });
    return { success: true };
  }

  async getProjectPdf(user: JwtPayload, id: string) {
    this.assertManagement(user);
    const project = await this.loadProjectForPdf(this.companyId(user), id);
    const buffer = await this.estimatePdf.build(project);
    return { buffer, filename: `${project.number}.pdf` };
  }

  async getPortalProject(customerId: string, projectId: string) {
    const project = await this.prisma.estimateProject.findFirst({
      where: {
        id: projectId,
        customerId,
        status: {
          in: [
            EstimateProjectStatus.SENT,
            EstimateProjectStatus.ACCEPTED,
            EstimateProjectStatus.IN_EXECUTION,
            EstimateProjectStatus.DONE,
            EstimateProjectStatus.CANCELLED,
          ],
        },
      },
      include: {
        customer: true,
        category: { select: { id: true, name: true, slug: true } },
        company: { select: { id: true, name: true, slug: true } },
        stages: {
          orderBy: { sortOrder: 'asc' },
          include: { lines: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return project;
  }

  async getPortalProjectPdf(customerId: string, projectId: string) {
    const project = await this.loadProjectForPdf(undefined, projectId, customerId);
    const buffer = await this.estimatePdf.build(project);
    return { buffer, filename: `${project.number}.pdf` };
  }

  async getWorksheetByIntervention(user: JwtPayload, interventionId: string) {
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        id: interventionId,
        companyId: this.companyId(user),
        ...(this.isTechnician(user) && user.memberId
          ? { technicianId: user.memberId }
          : {}),
      },
      include: {
        customer: { select: { fullName: true, phone: true, address: true } },
        estimateProject: {
          include: {
            category: true,
            sitePlan: true,
            stages: {
              orderBy: { sortOrder: 'asc' },
              include: { lines: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
        estimateStage: true,
      },
    });

    if (!intervention?.estimateProject) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }

    return this.toWorksheet(intervention);
  }

  async getWorksheetByProject(user: JwtPayload, projectId: string) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const project = await this.findProjectOrThrow(user, projectId);
    return this.toWorksheetFromProject(project, false);
  }

  private toWorksheet(intervention: {
    id: string;
    number: string;
    type: string;
    description: string;
    address: string;
    status: string;
    checklistProgress?: unknown;
    customer: { fullName: string; phone: string; address: string };
    estimateStage: { id: string; name: string; code: string } | null;
    estimateProject: NonNullable<Awaited<ReturnType<typeof this.findProjectOrThrow>>>;
  }) {
    const project = intervention.estimateProject;
    const stages = intervention.estimateStage
      ? project.stages.filter((s) => s.id === intervention.estimateStage!.id)
      : project.stages;

    return {
      intervention: {
        id: intervention.id,
        number: intervention.number,
        type: intervention.type,
        description: intervention.description,
        address: intervention.address,
        status: intervention.status,
        checklistProgress: (intervention.checklistProgress as Record<string, boolean> | null) ?? {},
      },
      customer: intervention.customer,
      project: {
        id: project.id,
        number: project.number,
        title: project.title,
        category: project.category,
      },
      sitePlan: project.sitePlan
        ? { plan2d: project.sitePlan.plan2d, plan3d: project.sitePlan.plan3d }
        : null,
      stages: stages.map((stage) => ({
        id: stage.id,
        code: stage.code,
        name: stage.name,
        description: stage.description,
        laborHours: stage.laborHours ? Number(stage.laborHours) : null,
        durationDays: stage.durationDays,
        checklist: stage.checklist,
        materials: stage.lines
          .filter((line) => line.source !== 'stage-default')
          .map((line) => ({
            id: line.id,
            description: line.description,
            qty: Number(line.qty),
            unit: line.unit,
            materialStore: line.materialStore,
            receiptFileKey: line.receiptFileKey,
          })),
      })),
    };
  }

  private toWorksheetFromProject(
    project: Awaited<ReturnType<typeof this.findProjectOrThrow>>,
    hidePrices: boolean,
  ) {
    return {
      project: {
        id: project.id,
        number: project.number,
        title: project.title,
        category: project.category,
        customer: project.customer,
        address: project.address,
        status: project.status,
        ...(hidePrices
          ? {}
          : {
              laborTotal: Number(project.laborTotal),
              materialTotal: Number(project.materialTotal),
              grandTotal: Number(project.grandTotal),
            }),
      },
      sitePlan: project.sitePlan
        ? { plan2d: project.sitePlan.plan2d, plan3d: project.sitePlan.plan3d }
        : null,
      stages: project.stages.map((stage) => ({
        id: stage.id,
        code: stage.code,
        name: stage.name,
        description: stage.description,
        laborHours: stage.laborHours ? Number(stage.laborHours) : null,
        durationDays: stage.durationDays,
        checklist: stage.checklist,
        materials: stage.lines.map((line) => ({
          id: line.id,
          description: line.description,
          qty: Number(line.qty),
          unit: line.unit,
          materialStore: line.materialStore,
          receiptFileKey: line.receiptFileKey,
          ...(hidePrices
            ? {}
            : { unitPrice: Number(line.unitPrice), lineTotal: Number(line.lineTotal) }),
        })),
        ...(hidePrices
          ? {}
          : {
              laborCost: Number(stage.laborCost),
              materialCost: Number(stage.materialCost),
              stageTotal: Number(stage.stageTotal),
            }),
      })),
    };
  }

  private async findProjectOrThrow(user: JwtPayload, id: string) {
    const project = await this.prisma.estimateProject.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: projectInclude,
    });
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return project;
  }

  private async loadProjectForPdf(companyId: string | undefined, id: string, customerId?: string) {
    const project = await this.prisma.estimateProject.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
        ...(customerId ? { customerId } : {}),
      },
      include: {
        company: {
          select: {
            name: true,
            legalName: true,
            idno: true,
            legalAddress: true,
            contactPhone: true,
            contactEmail: true,
            isTvaPayer: true,
            tvaCode: true,
          },
        },
        customer: true,
        category: { select: { name: true } },
        stages: {
          orderBy: { sortOrder: 'asc' },
          include: { lines: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return project;
  }

  private async nextProjectNumber(companyId: string) {
    const count = await this.prisma.estimateProject.count({ where: { companyId } });
    let number = `EST-${String(count + 1).padStart(5, '0')}`;
    for (let attempt = 0; attempt < 15; attempt++) {
      const exists = await this.prisma.estimateProject.findUnique({ where: { number } });
      if (!exists) return number;
      number = `EST-${String(count + 1 + attempt).padStart(5, '0')}`;
    }
    return number;
  }

  private async nextInterventionNumber(tx: Prisma.TransactionClient, companyId: string) {
    const count = await tx.intervention.count({ where: { companyId } });
    let number = `INT-${String(count + 1).padStart(5, '0')}`;
    for (let attempt = 0; attempt < 15; attempt++) {
      const exists = await tx.intervention.findUnique({ where: { number } });
      if (!exists) return number;
      number = `INT-${String(count + 1 + attempt).padStart(5, '0')}`;
    }
    return number;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function guessUnit(key: string): string {
  if (key.endsWith('VolumeM3') || key.includes('Volume')) return 'm³';
  if (key.endsWith('Area') || key.includes('Area')) return 'm²';
  if (key.endsWith('LengthM') || key.includes('Length')) return 'm';
  if (key.endsWith('Hours') || key.includes('Hours')) return 'ore';
  if (key.endsWith('Count') || key.endsWith('Units')) return 'buc';
  return 'buc';
}
