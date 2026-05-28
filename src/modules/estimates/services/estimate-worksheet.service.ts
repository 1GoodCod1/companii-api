import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesContextService } from '../context/estimates-context.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';

@Injectable()
export class EstimateWorksheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
  ) {}

  async listAssignedForTechnician(user: JwtPayload) {
    if (!this.ctx.isTechnician(user) || !user.memberId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }

    const interventions = await this.prisma.intervention.findMany({
      where: {
        companyId: this.ctx.companyId(user),
        technicianId: user.memberId,
        estimateProjectId: { not: null },
        status: { in: ['NEW', 'SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS'] },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        address: true,
        scheduledAt: true,
        customer: { select: { fullName: true, phone: true } },
        estimateProject: {
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            category: { select: { id: true, name: true, slug: true } },
          },
        },
        estimateStage: { select: { id: true, name: true, code: true } },
      },
    });

    return interventions.map((item) => ({
      intervention: {
        id: item.id,
        number: item.number,
        type: item.type,
        status: item.status,
        address: item.address,
        scheduledAt: item.scheduledAt,
      },
      customer: item.customer,
      project: item.estimateProject,
      stage: item.estimateStage,
    }));
  }

  async getByIntervention(user: JwtPayload, interventionId: string) {
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        id: interventionId,
        companyId: this.ctx.companyId(user),
        ...(this.ctx.isTechnician(user) && user.memberId
          ? { technicianId: user.memberId }
          : {}),
      },
      include: {
        customer: { select: { fullName: true, phone: true, address: true } },
        photos: { orderBy: { sortOrder: 'asc' } },
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

  async getByProject(user: JwtPayload, projectId: string) {
    if (this.ctx.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const project = await this.access.findProjectOrThrow(user, projectId);
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
    photos?: Array<{ id: string; fileKey: string; sortOrder: number }>;
    estimateStage: { id: string; name: string; code: string } | null;
    estimateProject: NonNullable<Awaited<ReturnType<typeof this.access.findProjectOrThrow>>>;
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
      photos: (intervention.photos ?? []).map((p) => ({
        id: p.id,
        fileKey: p.fileKey,
        sortOrder: p.sortOrder,
      })),
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
    project: Awaited<ReturnType<typeof this.access.findProjectOrThrow>>,
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
}
