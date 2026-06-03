import { Inject, Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PORTAL_REPOSITORY } from '../domain/ports/portal.repository.port';
import type { PrismaPortalRepository } from '../infrastructure/persistence/prisma-portal.repository';
import { InvoicePdfService } from '../../fsm/pdf/invoice-pdf.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Injectable()
export class GetPortalInvoicePdfUseCase {
  constructor(
    @Inject(PORTAL_REPOSITORY)
    private readonly portalRepo: PrismaPortalRepository,
    private readonly invoicePdf: InvoicePdfService,
  ) {}

  async execute(user: JwtPayload, invoiceId: string) {
    const invoice = await this.portalRepo.getInvoicePdfData(invoiceId, user.sub);
    if (!invoice) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const buffer = await this.invoicePdf.build(invoice);
    return {
      buffer,
      filename: `${invoice.number}.pdf`,
    };
  }
}
