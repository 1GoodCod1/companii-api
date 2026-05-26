import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus, EstimateStageKind, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { projectInclude } from '../estimate.constants';
import { EstimatesContextService } from '../context/estimates-context.service';
import { EstimatePricingEngine } from '../pricing/pricing-engine.service';
import type { Plan2dData } from '../pricing/pricing-engine.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';

@Injectable()
export class EstimateProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly pricing: EstimatePricingEngine,
    private readonly access: EstimateProjectAccessService,
  ) {}

  list(user: JwtPayload) {
    this.ctx.assertManagement(user);
    return this.prisma.estimateProject.findMany({
      where: { companyId: this.ctx.companyId(user) },
      include: {
        customer: true,
        category: true,
        quote: { select: { id: true, number: true, status: true } },
        stages: { select: { id: true, name: true, sortOrder: true, stageTotal: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: JwtPayload, id: string) {
    const project = await this.access.findProjectOrThrow(user, id);
    if (this.ctx.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    return project;
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

    const config = this.ctx.parseBlueprintConfig(blueprint.config);
    const number = await this.access.nextProjectNumber(cid);

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
    },
  ) {
    this.ctx.assertManagement(user);
    await this.access.findProjectOrThrow(user, id);

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
    this.ctx.assertManagement(user);
    const project = await this.access.findProjectOrThrow(user, id);
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
}
