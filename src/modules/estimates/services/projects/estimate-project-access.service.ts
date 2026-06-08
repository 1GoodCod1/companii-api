import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { projectInclude } from '../../estimate.constants';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { nextCompanyNumber } from '../../../../common/utils/sequence-number.util';
import { RLS_SYSTEM_CONTEXT } from '../../../../common/rls/rls-system.util';

@Injectable()
export class EstimateProjectAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
  ) {}

  async findProjectOrThrow(user: JwtPayload, id: string) {
    const project = await this.prisma.estimateProject.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: projectInclude,
    });
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return project;
  }

  async loadProjectForPdf(companyId: string | undefined, id: string, customerId?: string) {
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

  nextProjectNumber(tx: Prisma.TransactionClient, companyId: string) {
    return nextCompanyNumber(tx, {
      companyId,
      namespace: 'estimate-number',
      prefix: 'EST',
      count: (year) =>
        tx.estimateProject.count({
          where: {
            companyId,
            createdAt: {
              gte: new Date(year, 0, 1),
              lt: new Date(year + 1, 0, 1),
            },
          },
        }),
      exists: async (number) =>
        this.prisma.runOutsideRlsContext(() =>
          this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) => {
            const project = await db.estimateProject.findUnique({
              where: { number },
              select: { id: true },
            });
            return project !== null;
          }),
        ),
    });
  }

  nextInterventionNumber(tx: Prisma.TransactionClient, companyId: string) {
    return nextCompanyNumber(tx, {
      companyId,
      namespace: 'intervention-number',
      prefix: 'INT',
      count: (year) =>
        tx.intervention.count({
          where: {
            companyId,
            createdAt: {
              gte: new Date(year, 0, 1),
              lt: new Date(year + 1, 0, 1),
            },
          },
        }),
      exists: async (number) =>
        this.prisma.runOutsideRlsContext(() =>
          this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) => {
            const intv = await db.intervention.findUnique({
              where: { number },
              select: { id: true },
            });
            return intv !== null;
          }),
        ),
    });
  }
}
