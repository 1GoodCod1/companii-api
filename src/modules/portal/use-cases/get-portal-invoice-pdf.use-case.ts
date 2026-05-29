import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { findPortalCustomerForUser } from '../../../common/utils/portal-customer.util';
import { PrismaService } from '../../shared/database/prisma.service';
import { InvoicePdfService } from '../../fsm/pdf/invoice-pdf.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Injectable()
export class GetPortalInvoicePdfUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicePdf: InvoicePdfService,
  ) {}

  async execute(user: JwtPayload, invoiceId: string) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: {
        id: invoiceId,
        intervention: { customerId: customer.id },
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
        intervention: { include: { customer: true } },
      },
    });
    if (!invoice) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const buffer = await this.invoicePdf.build(invoice);
    return {
      buffer,
      filename: `${invoice.number}.pdf`,
    };
  }
}
