import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { findPortalCustomerForUser } from '../../../common/utils/portal-customer.util';
import { PrismaService } from '../../shared/database/prisma.service';
import { EstimatePdfService } from '../../fsm/pdf/estimate-pdf.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Injectable()
export class GetPortalEstimatePdfUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly estimatePdf: EstimatePdfService,
  ) {}

  async execute(user: JwtPayload, projectId: string, lang?: 'ro' | 'ru') {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const project = await this.prisma.estimateProject.findFirst({
      where: { id: projectId, customerId: customer.id },
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

    const buffer = await this.estimatePdf.build(project, { isClientView: true, locale: lang });
    return { buffer, filename: `${project.number}.pdf` };
  }
}
