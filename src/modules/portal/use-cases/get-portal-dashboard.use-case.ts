import { Inject, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { PORTAL_REPOSITORY } from '../domain/ports/portal.repository.port';
import type { PrismaPortalRepository } from '../infrastructure/persistence/prisma-portal.repository';

@Injectable()
export class GetPortalDashboardUseCase {
  constructor(
    @Inject(PORTAL_REPOSITORY)
    private readonly portalRepo: PrismaPortalRepository,
  ) {}

  async execute(user: JwtPayload) {
    const customer = await this.portalRepo.findCustomerByUserId(user.sub);
    const dashboardData = await this.portalRepo.getDashboardData(user.sub);

    return {
      customer,
      ...dashboardData,
    };
  }
}
