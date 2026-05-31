import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { findPortalCustomerForUser } from '../../../common/utils/portal-customer.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { PortalEstimateTransformer } from '../transformers/portal-estimate.transformer';

const portalEstimateInclude = {
  customer: true,
  category: { select: { id: true, name: true, slug: true } },
  company: { select: { id: true, name: true, slug: true } },
  blueprint: { select: { id: true, config: true } },
  measurements: { orderBy: { key: 'asc' as const } },
  stages: {
    orderBy: { sortOrder: 'asc' as const },
    include: { lines: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

@Injectable()
export class GetPortalEstimateUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(user: JwtPayload, projectId: string) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const project = await this.prisma.estimateProject.findFirst({
      where: {
        id: projectId,
        customerId: customer.id,
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
      include: portalEstimateInclude,
    });
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return PortalEstimateTransformer.toClientView(project);
  }
}
