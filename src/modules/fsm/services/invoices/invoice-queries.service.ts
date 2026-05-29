import { Injectable } from '@nestjs/common';
import { InvoicePaymentStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import { FsmContextService } from '../../context/fsm-context.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { paymentStatusRoLabel } from '../../pdf/pdf-format.util';

@Injectable()
export class InvoiceQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
  ) {}

  list(user: JwtPayload, cursor?: string, limit = 25, status?: InvoicePaymentStatus) {
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.companyInvoice.findMany({
      where: {
        companyId: this.ctx.companyId(user),
        ...(status ? { paymentStatus: status } : {}),
      },
      select: {
        id: true,
        number: true,
        amount: true,
        tvaAmount: true,
        paymentStatus: true,
        dueDate: true,
        issuedAt: true,
        intervention: {
          select: {
            id: true,
            number: true,
            description: true,
            status: true,
            customer: { select: { id: true, fullName: true, phone: true } },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take,
    }).then((items) => {
      if (!cursor) {
        return items as any;
      }
      return {
        items,
        nextCursor: items.length === take ? items[items.length - 1]?.id : null,
      };
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

  async exportCsv(user: JwtPayload) {
    this.ctx.assertNotTechnician(user);
    const invoices = await this.prisma.companyInvoice.findMany({
      where: { companyId: this.ctx.companyId(user) },
      include: { intervention: { include: { customer: true } } },
      orderBy: { issuedAt: 'desc' },
    });

    const header = 'Număr,Client,Sumă bază,TVA,Total cu TVA,Status plată,Data emiterii,Scadență\n';
    const rows = invoices
      .map((inv) => {
        const customer = inv.intervention?.customer?.fullName ?? '';
        const base = Number(inv.amount);
        const tva = Number(inv.tvaAmount);
        return [
          inv.number,
          `"${customer.replace(/"/g, '""')}"`,
          base.toFixed(2),
          tva.toFixed(2),
          (base + tva).toFixed(2),
          paymentStatusRoLabel(inv.paymentStatus),
          inv.issuedAt.toISOString().slice(0, 10),
          inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : '',
        ].join(',');
      })
      .join('\n');

    return { csv: header + rows, filename: 'facturi-export.csv' };
  }
}
