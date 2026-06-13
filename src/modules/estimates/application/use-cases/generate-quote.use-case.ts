import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus as PrismaStatus } from '@prisma/client';
import { AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from '../../services/projects/estimate-project-access.service';
import { EstimateStagesService } from '../../services/projects/estimate-stages.service';
import { projectInclude, round2 } from '../../estimate.constants';
import { isEstimateRecalculable } from '../../utils/project/estimate-status-transitions.util';
import {
  estimateClientPriceFactor,
  toClientPrice,
} from '../../utils/calculation/client-price.util';
import { nextCompanyNumber } from '../../../../common/utils/sequence-number.util';
import { RLS_SYSTEM_CONTEXT } from '../../../../common/rls/rls-system.util';

@Injectable()
export class GenerateQuoteUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
    private readonly stages: EstimateStagesService,
  ) {}

  async execute(user: JwtPayload, id: string) {
    this.ctx.assertManagement(user);
    let project = await this.access.findProjectOrThrow(user, id);
    if (project.quoteId) {
      throw AppErrors.conflict('Quote already generated for this estimate');
    }
    if (
      project.status !== PrismaStatus.CALCULATED &&
      project.status !== PrismaStatus.APPROVED
    ) {
      if (!isEstimateRecalculable(project.status)) {
        throw AppErrors.badRequest('Calculați calculul de preț înainte de a genera oferta.');
      }
      project = await this.stages.calculate(user, id);
    }

    const cid = this.ctx.companyId(user);

    return this.prisma.$transaction(async (tx) => {
      const number = await nextCompanyNumber(tx, {
        companyId: cid,
        namespace: 'quote-number',
        prefix: 'QTE',
        count: (year) =>
          tx.quote.count({
            where: {
              companyId: cid,
              createdAt: {
                gte: new Date(year, 0, 1),
                lt: new Date(year + 1, 0, 1),
              },
            },
          }),
        exists: async (n) =>
          this.prisma.runOutsideRlsContext(() =>
            this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) => {
              const q = await db.quote.findUnique({
                where: { number: n },
                select: { id: true },
              });
              return q !== null;
            }),
          ),
      });
      const priceFactor = estimateClientPriceFactor(project);
      const projectVatRate = project.tvaRate !== null ? Number(project.tvaRate) : null;
      const lines = project.stages.flatMap((stage) =>
        stage.lines.map((line) => ({
          description: `[${stage.name}] ${line.description}`,
          qty: Number(line.qty),
          unitPrice: toClientPrice(line.unitPrice, priceFactor),
          vatRate:
            line.vatRate !== null && line.vatRate !== undefined
              ? Number(line.vatRate)
              : projectVatRate ?? undefined,
        })),
      );

      const total = round2(lines.reduce((acc, line) => acc + line.qty * line.unitPrice, 0));
      const quote = await tx.quote.create({
        data: {
          companyId: cid,
          customerId: project.customerId,
          number,
          total,
          validUntil: project.validUntil ?? undefined,
          status: 'DRAFT' as const,
          lines: { create: lines },
        },
      });

      return tx.estimateProject.update({
        where: { id },
        data: {
          quoteId: quote.id,
          status: PrismaStatus.APPROVED,
        },
        include: projectInclude,
      });
    });
  }
}