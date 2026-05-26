import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { projectInclude } from '../estimate.constants';
import { EstimatesContextService } from '../context/estimates-context.service';

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

  async nextProjectNumber(companyId: string) {
    const count = await this.prisma.estimateProject.count({ where: { companyId } });
    let number = `EST-${String(count + 1).padStart(5, '0')}`;
    for (let attempt = 0; attempt < 15; attempt++) {
      const exists = await this.prisma.estimateProject.findUnique({ where: { number } });
      if (!exists) return number;
      number = `EST-${String(count + 1 + attempt).padStart(5, '0')}`;
    }
    return number;
  }

  async nextInterventionNumber(tx: Prisma.TransactionClient, companyId: string) {
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
