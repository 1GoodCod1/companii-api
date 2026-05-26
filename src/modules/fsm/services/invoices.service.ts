import { Injectable } from '@nestjs/common';
import { InvoicePaymentStatus, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { InvoicePdfService } from '../pdf/invoice-pdf.service';
import { FsmContextService } from '../context/fsm-context.service';
import { assertPaymentTransition } from '../utils/status-transitions';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
    private readonly invoicePdf: InvoicePdfService,
  ) {}

  list(user: JwtPayload) {
    return this.prisma.companyInvoice.findMany({
      where: { companyId: this.ctx.companyId(user) },
      include: { intervention: { include: { customer: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async get(user: JwtPayload, id: string) {
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: { intervention: { include: { customer: true } } },
    });
    if (!invoice) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return invoice;
  }

  async create(
    user: JwtPayload,
    data: {
      interventionId: string;
      tvaRate?: number;
      dueDate?: string;
    },
  ) {
    const cid = this.ctx.companyId(user);
    const intervention = await this.prisma.intervention.findFirst({
      where: { id: data.interventionId, companyId: cid },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const price = intervention.finalPrice || intervention.estimatedPrice || new Prisma.Decimal(0);
    const tvaRate = data.tvaRate ?? 20;
    const tvaAmount = new Prisma.Decimal(Number(price) * (tvaRate / 100));

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.companyInvoice.count({ where: { companyId: cid } });

      let number = `INV-${String(count + 1).padStart(5, '0')}`;
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 15) {
        const existing = await tx.companyInvoice.findUnique({ where: { number } });
        if (!existing) isUnique = true;
        else {
          attempts++;
          number = `INV-${String(count + 1 + attempts).padStart(5, '0')}`;
        }
      }

      const invoice = await tx.companyInvoice.create({
        data: {
          companyId: cid,
          interventionId: data.interventionId,
          number,
          amount: price,
          tvaRate,
          tvaAmount,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        },
      });

      await tx.intervention.update({
        where: { id: data.interventionId },
        data: { status: 'INVOICED' },
      });

      if (user.memberId) {
        await tx.interventionStatusHistory.create({
          data: {
            interventionId: data.interventionId,
            fromStatus: intervention.status,
            toStatus: 'INVOICED',
            changedByMemberId: user.memberId,
            note: `Facturată cu nr. ${number}`,
          },
        });
      }

      return invoice;
    });
  }

  async update(
    user: JwtPayload,
    id: string,
    data: {
      paymentStatus?: InvoicePaymentStatus;
      dueDate?: string | null;
    },
  ) {
    const existing = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (data.paymentStatus && data.paymentStatus !== existing.paymentStatus) {
      try {
        assertPaymentTransition(existing.paymentStatus, data.paymentStatus);
      } catch {
        throw AppErrors.badRequest(AppErrorMessages.STATUS_TRANSITION_INVALID);
      }
    }

    const updated = await this.prisma.companyInvoice.update({
      where: { id },
      data: {
        paymentStatus: data.paymentStatus,
        dueDate: data.dueDate === null ? null : data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });

    if (data.paymentStatus === 'PAID' && existing.interventionId && existing.paymentStatus !== 'PAID') {
      const intervention = await this.prisma.intervention.findUnique({
        where: { id: existing.interventionId },
      });
      if (intervention && intervention.status !== 'PAID') {
        await this.prisma.$transaction(async (tx) => {
          await tx.intervention.update({
            where: { id: existing.interventionId! },
            data: { status: 'PAID' },
          });
          if (user.memberId) {
            await tx.interventionStatusHistory.create({
              data: {
                interventionId: existing.interventionId!,
                fromStatus: intervention.status,
                toStatus: 'PAID',
                changedByMemberId: user.memberId,
                note: `Plată confirmată pentru Factura ${existing.number}`,
              },
            });
          }
        });
      }
    }

    return updated;
  }

  async delete(user: JwtPayload, id: string) {
    const existing = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing.paymentStatus === 'PAID') {
      throw AppErrors.badRequest('Cannot delete paid invoices.');
    }

    await this.prisma.companyInvoice.delete({ where: { id } });
    return { success: true };
  }

  async getPdf(user: JwtPayload, id: string) {
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
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

  async exportCsv(user: JwtPayload) {
    this.ctx.assertNotTechnician(user);
    const invoices = await this.prisma.companyInvoice.findMany({
      where: { companyId: this.ctx.companyId(user) },
      include: { intervention: { include: { customer: true } } },
      orderBy: { issuedAt: 'desc' },
    });

    const header = 'Număr,Client,Sumă,TVA,Status plată,Data emiterii,Scadență\n';
    const rows = invoices
      .map((inv) => {
        const customer = inv.intervention?.customer?.fullName ?? '';
        return [
          inv.number,
          `"${customer.replace(/"/g, '""')}"`,
          Number(inv.amount).toFixed(2),
          Number(inv.tvaAmount).toFixed(2),
          inv.paymentStatus,
          inv.issuedAt.toISOString().slice(0, 10),
          inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : '',
        ].join(',');
      })
      .join('\n');

    return { csv: header + rows, filename: 'facturi-export.csv' };
  }
}
