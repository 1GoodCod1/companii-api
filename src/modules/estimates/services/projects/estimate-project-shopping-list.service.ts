import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from './estimate-project-access.service';
import { isEstimateLaborLine } from '../../utils/calculation/estimate-line-recalculate.util';
import { EstimatePdfService } from '../../../fsm/pdf/estimate-pdf.service';

@Injectable()
export class EstimateProjectShoppingListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly estimatePdf: EstimatePdfService,
  ) {}

  async getShoppingList(user: JwtPayload, id: string) {
    await this.access.findProjectOrThrow(user, id);
    const isMember = this.ctx.isTechnician(user);
    const lines = await this.prisma.estimateLine.findMany({
      where: {
        stage: { projectId: id },
        actualStatus: 'PENDING',
      },
      include: { stage: true },
      orderBy: { sortOrder: 'asc' },
    });

    const grouped: Record<string, any[]> = {};

    for (const line of lines) {
      const isLabor = isEstimateLaborLine({
        unit: line.unit,
        description: line.description,
        stageKind: line.stage.kind,
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
}
