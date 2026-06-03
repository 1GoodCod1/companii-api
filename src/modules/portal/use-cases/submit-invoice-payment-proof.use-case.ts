import { Inject, Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PORTAL_REPOSITORY } from '../domain/ports/portal.repository.port';
import type { PrismaPortalRepository } from '../infrastructure/persistence/prisma-portal.repository';
import { EmailService } from '../../email/email.service';
import { InvoiceLifecycleService } from '../../fsm/services/invoices/invoice-lifecycle.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Injectable()
export class SubmitInvoicePaymentProofUseCase {
  constructor(
    @Inject(PORTAL_REPOSITORY)
    private readonly portalRepo: PrismaPortalRepository,
    private readonly lifecycle: InvoiceLifecycleService,
    private readonly email: EmailService,
  ) {}

  async execute(user: JwtPayload, invoiceId: string, fileId: string) {
    const customerId = await this.portalRepo.findOwnedInvoiceCustomerId(invoiceId, user.sub);
    if (!customerId) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }
    const invoice = await this.lifecycle.submitPaymentProof({
      invoiceId,
      customerId,
      fileId,
      uploadedByUserId: user.sub,
    });

    const full = await this.portalRepo.getInvoiceDetails(invoice.id);

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
