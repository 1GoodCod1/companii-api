import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from '../../services/projects/estimate-project-access.service';
import { EstimateProjectActualsService } from '../../services/projects/estimate-project-actuals.service';
import type { EstimateProjectDetail } from '../../estimate.constants';

@Injectable()
export class GetProjectQuery {
  constructor(
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly actuals: EstimateProjectActualsService,
  ) {}

  async execute(user: JwtPayload, id: string) {
    const project = await this.access.findProjectOrThrow(user, id);
    if (this.ctx.isTechnician(user)) {
      return this.sanitizeForTechnician(project);
    }
    return this.actuals.computeProjectActualsAndVariance(project);
  }

  private sanitizeForTechnician(project: EstimateProjectDetail) {
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
