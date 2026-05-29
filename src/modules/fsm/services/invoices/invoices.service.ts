import { Injectable } from '@nestjs/common';
import { InvoicePaymentStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import { EmailService } from '../../../email/email.service';
import { FsmContextService } from '../../context/fsm-context.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { InvoiceQueriesService } from './invoice-queries.service';
import { InvoicePdfCacheService } from './invoice-pdf-cache.service';
import { InvoiceLifecycleService } from './invoice-lifecycle.service';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
    private readonly queries: InvoiceQueriesService,
    private readonly pdfCache: InvoicePdfCacheService,
    private readonly lifecycle: InvoiceLifecycleService,
    private readonly email: EmailService,
  ) {}

  list(user: JwtPayload, cursor?: string, limit = 25, status?: InvoicePaymentStatus) {
    return this.queries.list(user, cursor, limit, status);
  }

  async get(user: JwtPayload, id: string) {
    return this.queries.get(user, id);
  }

  async create(
    user: JwtPayload,
    data: {
      interventionId: string;
      tvaRate?: number;
      dueDate?: string;
    },
  ) {
    return this.lifecycle.create(user, data);
  }

  async update(
    user: JwtPayload,
    id: string,
    data: {
      paymentStatus?: InvoicePaymentStatus;
      dueDate?: string | null;
      paymentReversalReason?: string;
    },
  ) {
    return this.lifecycle.update(user, id, data);
  }

  async cancel(user: JwtPayload, id: string, reason: string) {
    return this.lifecycle.cancel(user, id, reason);
  }

  async recordPayment(
    user: JwtPayload,
    id: string,
    data: { amount: number; note?: string },
  ) {
    return this.lifecycle.recordPayment(user, id, data);
  }

  async delete(user: JwtPayload, id: string) {
    return this.lifecycle.delete(user, id);
  }

  async getPdf(user: JwtPayload, id: string) {
    return this.pdfCache.getPdf(user, id);
  }

  async sendByEmail(user: JwtPayload, id: string, customMessage?: string) {
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: {
        company: { select: { name: true } },
        intervention: { include: { customer: true } },
      },
    });
    if (!invoice) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const recipient = invoice.intervention?.customer?.email?.trim();
    if (!recipient) {
      throw AppErrors.badRequest('Customer has no email on file.');
    }

    const { buffer } = await this.getPdf(user, id);

    const ok = await this.email.sendInvoiceEmail({
      to: recipient,
      companyName: invoice.company.name,
      invoiceNumber: invoice.number,
      total: Number(invoice.amount) + Number(invoice.tvaAmount),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
      paymentStatus: invoice.paymentStatus,
      customMessage,
      pdfBuffer: buffer,
    });

    return { sent: ok, recipient };
  }

  async exportCsv(user: JwtPayload) {
    return this.queries.exportCsv(user);
  }
}
