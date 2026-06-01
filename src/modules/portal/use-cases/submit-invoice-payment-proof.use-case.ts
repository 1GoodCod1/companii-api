import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { findPortalCustomerForUser } from '../../../common/utils/portal-customer.util';
import { PrismaService } from '../../shared/database/prisma.service';
import { EmailService } from '../../email/email.service';
import { InvoiceLifecycleService } from '../../fsm/services/invoices/invoice-lifecycle.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Injectable()
export class SubmitInvoicePaymentProofUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: InvoiceLifecycleService,
    private readonly email: EmailService,
  ) {}

  async execute(user: JwtPayload, invoiceId: string, fileId: string) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const invoice = await this.lifecycle.submitPaymentProof({
      invoiceId,
      customerId: customer.id,
      fileId,
      uploadedByUserId: user.sub,
    });

    const full = await this.prisma.companyInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        intervention: { include: { customer: { select: { fullName: true } } } },
        company: {
          select: {
            name: true,
            contactEmail: true,
            owner: { select: { email: true } },
          },
        },
      },
    });

    const notifyEmail = full.company.contactEmail ?? full.company.owner.email;
    if (notifyEmail) {
      void this.email.sendPaymentProofSubmittedEmail({
        to: notifyEmail,
        companyName: full.company.name,
        invoiceNumber: full.number,
        clientName: full.intervention?.customer?.fullName ?? 'Client',
        total: Number(full.amount) + Number(full.tvaAmount),
      });
    }

    return invoice;
  }
}
