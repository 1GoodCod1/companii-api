import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { FsmContextService } from '../context/fsm-context.service';

type TimelineItem = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  status?: string;
  at: string;
  meta?: Record<string, unknown>;
};

@Injectable()
export class CustomerTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
  ) {}

  async get(user: JwtPayload, customerId: string) {
    this.ctx.assertNotTechnician(user);
    const cid = this.ctx.companyId(user);
    const customer = await this.prisma.companyCustomer.findFirst({
      where: { id: customerId, companyId: cid },
    });
    if (!customer) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const [interventions, quotes, estimates, invoices, leads, notes] = await this.prisma.inSerial([
      () =>
        this.prisma.intervention.findMany({
          where: { customerId, companyId: cid },
          orderBy: { createdAt: 'desc' },
          select: { id: true, number: true, type: true, status: true, createdAt: true, updatedAt: true },
        }),
      () =>
        this.prisma.quote.findMany({
          where: { customerId, companyId: cid },
          orderBy: { createdAt: 'desc' },
          select: { id: true, number: true, status: true, total: true, createdAt: true, updatedAt: true },
        }),
      () =>
        this.prisma.estimateProject.findMany({
          where: { customerId, companyId: cid },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            grandTotal: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      () =>
        this.prisma.companyInvoice.findMany({
          where: { companyId: cid, intervention: { customerId } },
          orderBy: { issuedAt: 'desc' },
          select: { id: true, number: true, amount: true, paymentStatus: true, issuedAt: true },
        }),
      () =>
        this.prisma.companyLead.findMany({
          where: { companyId: cid, customerId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            contactName: true,
            status: true,
            source: true,
            serviceTitle: true,
            createdAt: true,
          },
        }),
      () =>
        this.prisma.interventionNote.findMany({
          where: { intervention: { customerId, companyId: cid }, isInternal: false },
          orderBy: { createdAt: 'desc' },
          select: { id: true, body: true, createdAt: true, interventionId: true },
        }),
    ]);

    const items: TimelineItem[] = [];

    for (const i of interventions) {
      items.push({
        id: i.id,
        type: 'intervention',
        title: `${i.number} · ${i.type}`,
        status: i.status,
        at: i.updatedAt.toISOString(),
        meta: { interventionId: i.id },
      });
    }
    for (const q of quotes) {
      items.push({
        id: q.id,
        type: 'quote',
        title: `Deviz ${q.number}`,
        subtitle: `${Number(q.total).toLocaleString('ro-MD')} MDL`,
        status: q.status,
        at: q.updatedAt.toISOString(),
        meta: { quoteId: q.id },
      });
    }
    for (const e of estimates) {
      items.push({
        id: e.id,
        type: 'estimate',
        title: `Smetă ${e.number} — ${e.title}`,
        subtitle: `${Number(e.grandTotal).toLocaleString('ro-MD')} MDL`,
        status: e.status,
        at: e.updatedAt.toISOString(),
        meta: { estimateId: e.id },
      });
    }
    for (const inv of invoices) {
      items.push({
        id: inv.id,
        type: 'invoice',
        title: `Factură ${inv.number}`,
        subtitle: `${Number(inv.amount).toLocaleString('ro-MD')} MDL`,
        status: inv.paymentStatus,
        at: inv.issuedAt.toISOString(),
        meta: { invoiceId: inv.id },
      });
    }
    for (const l of leads) {
      items.push({
        id: l.id,
        type: 'lead',
        title: l.serviceTitle ?? l.contactName,
        status: l.status,
        at: l.createdAt.toISOString(),
        meta: { leadId: l.id, source: l.source },
      });
    }
    for (const n of notes) {
      items.push({
        id: n.id,
        type: 'note',
        title: n.body.slice(0, 120),
        at: n.createdAt.toISOString(),
        meta: { interventionId: n.interventionId },
      });
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return { customer, items };
  }
}
