import { Inject, Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PORTAL_REPOSITORY } from '../domain/ports/portal.repository.port';
import type { PrismaPortalRepository } from '../infrastructure/persistence/prisma-portal.repository';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { PortalEstimateTransformer } from '../transformers/portal-estimate.transformer';

@Injectable()
export class GetPortalEstimateUseCase {
  constructor(
    @Inject(PORTAL_REPOSITORY)
    private readonly portalRepo: PrismaPortalRepository,
  ) {}

  async execute(user: JwtPayload, projectId: string) {
    const customer = await this.portalRepo.findCustomerByUserId(user.sub);
    const project = await this.portalRepo.findProjectByIdAndCustomer(projectId, customer.id);
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return PortalEstimateTransformer.toClientView(project);
  }
}
