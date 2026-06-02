import { Inject, Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PORTAL_REPOSITORY } from '../domain/ports/portal.repository.port';
import type { PrismaPortalRepository } from '../infrastructure/persistence/prisma-portal.repository';
import { EstimatePdfService } from '../../fsm/pdf/estimate-pdf.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Injectable()
export class GetPortalEstimatePdfUseCase {
  constructor(
    @Inject(PORTAL_REPOSITORY)
    private readonly portalRepo: PrismaPortalRepository,
    private readonly estimatePdf: EstimatePdfService,
  ) {}

  async execute(user: JwtPayload, projectId: string, lang?: 'ro' | 'ru') {
    const customer = await this.portalRepo.findCustomerByUserId(user.sub);
    const project = await this.portalRepo.getEstimatePdfData(projectId, customer.id);
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const buffer = await this.estimatePdf.build(project, { isClientView: true, locale: lang });
    return { buffer, filename: `${project.number}.pdf` };
  }
}
