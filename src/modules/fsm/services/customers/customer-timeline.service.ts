import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { FsmContextService } from '../../context/fsm-context.service';

type TimelineStep = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  status?: string;
  at: string;
  meta?: Record<string, unknown>;
};

type TimelineGroup = {
  id: string;
  kind: 'work' | 'request';
  title: string;
  status?: string;
  statusType?: string;
  at: string;
  interventionId?: string;
  steps: TimelineStep[];
};

const STEP_ORDER: Record<string, number> = {
  lead: 0,
  estimate: 1,
  quote: 2,
  intervention: 3,
  invoice: 4,
  note: 5,
};

function sortSteps(steps: TimelineStep[]): TimelineStep[] {
  return [...steps].sort((a, b) => {
    const orderDiff = (STEP_ORDER[a.type] ?? 99) - (STEP_ORDER[b.type] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.at).getTime() - new Date(b.at).getTime();
  });
}

function groupAt(steps: TimelineStep[]): string {
  const max = steps.reduce((acc, step) => {
    const time = new Date(step.at).getTime();
    return time > acc ? time : acc;
  }, 0);
  return new Date(max).toISOString();
}

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
          select: {
            id: true,
            number: true,
            type: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            sourceLeadId: true,
            estimateProjectId: true,
          },
        }),
      () =>
        this.prisma.quote.findMany({
          where: { customerId, companyId: cid },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            number: true,
            status: true,
            total: true,
            createdAt: true,
            updatedAt: true,
            interventionId: true,
          },
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
          select: {
            id: true,
            number: true,
            amount: true,
            paymentStatus: true,
            issuedAt: true,
            interventionId: true,
          },
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
            estimateProjectId: true,
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

    const consumedLeads = new Set<string>();
    const consumedEstimates = new Set<string>();
    const consumedQuotes = new Set<string>();
    const consumedInvoices = new Set<string>();
    const consumedNotes = new Set<string>();
    const groups: TimelineGroup[] = [];

    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    const estimateById = new Map(estimates.map((estimate) => [estimate.id, estimate]));

    const pushEstimateStep = (steps: TimelineStep[], estimateId: string) => {
      if (consumedEstimates.has(estimateId)) return;
      const estimate = estimateById.get(estimateId);
      if (!estimate) return;
      consumedEstimates.add(estimate.id);
      steps.push({
        id: estimate.id,
        type: 'estimate',
        title: `Calcul de preț ${estimate.number} — ${estimate.title}`,
        subtitle: `${Number(estimate.grandTotal).toLocaleString('ro-MD')} MDL`,
        status: estimate.status,
        at: estimate.updatedAt.toISOString(),
        meta: { estimateId: estimate.id },
      });
    };

    for (const intervention of interventions) {
      const steps: TimelineStep[] = [];

      if (intervention.sourceLeadId) {
        const lead = leadById.get(intervention.sourceLeadId);
        if (lead) {
          consumedLeads.add(lead.id);
          steps.push({
            id: lead.id,
            type: 'lead',
            title: lead.serviceTitle ?? lead.contactName,
            status: lead.status,
            at: lead.createdAt.toISOString(),
            meta: { leadId: lead.id, source: lead.source },
          });
          if (lead.estimateProjectId) {
            pushEstimateStep(steps, lead.estimateProjectId);
          }
        }
      }

      if (intervention.estimateProjectId) {
        pushEstimateStep(steps, intervention.estimateProjectId);
      }

      steps.push({
        id: intervention.id,
        type: 'intervention',
        title: `${intervention.number} · ${intervention.type}`,
        status: intervention.status,
        at: intervention.updatedAt.toISOString(),
        meta: { interventionId: intervention.id },
      });

      for (const quote of quotes) {
        if (quote.interventionId !== intervention.id) continue;
        consumedQuotes.add(quote.id);
        steps.push({
          id: quote.id,
          type: 'quote',
          title: `Deviz ${quote.number}`,
          subtitle: `${Number(quote.total).toLocaleString('ro-MD')} MDL`,
          status: quote.status,
          at: quote.updatedAt.toISOString(),
          meta: { quoteId: quote.id, interventionId: intervention.id },
        });
      }

      for (const invoice of invoices) {
        if (invoice.interventionId !== intervention.id) continue;
        consumedInvoices.add(invoice.id);
        steps.push({
          id: invoice.id,
          type: 'invoice',
          title: `Factură ${invoice.number}`,
          subtitle: `${Number(invoice.amount).toLocaleString('ro-MD')} MDL`,
          status: invoice.paymentStatus,
          at: invoice.issuedAt.toISOString(),
          meta: { invoiceId: invoice.id, interventionId: intervention.id },
        });
      }

      for (const note of notes) {
        if (note.interventionId !== intervention.id) continue;
        consumedNotes.add(note.id);
        steps.push({
          id: note.id,
          type: 'note',
          title: note.body.slice(0, 120),
          at: note.createdAt.toISOString(),
          meta: { interventionId: intervention.id },
        });
      }

      const sortedSteps = sortSteps(steps);
      groups.push({
        id: intervention.id,
        kind: 'work',
        title: `${intervention.number} · ${intervention.type}`,
        status: intervention.status,
        statusType: 'intervention',
        at: groupAt(sortedSteps),
        interventionId: intervention.id,
        steps: sortedSteps,
      });
    }

    for (const lead of leads) {
      if (consumedLeads.has(lead.id)) continue;

      const steps: TimelineStep[] = [
        {
          id: lead.id,
          type: 'lead',
          title: lead.serviceTitle ?? lead.contactName,
          status: lead.status,
          at: lead.createdAt.toISOString(),
          meta: { leadId: lead.id, source: lead.source },
        },
      ];

      if (lead.estimateProjectId) {
        pushEstimateStep(steps, lead.estimateProjectId);
      }

      const sortedSteps = sortSteps(steps);
      groups.push({
        id: lead.id,
        kind: 'request',
        title: lead.serviceTitle ?? lead.contactName,
        status: lead.status,
        statusType: 'lead',
        at: groupAt(sortedSteps),
        steps: sortedSteps,
      });
    }

    for (const estimate of estimates) {
      if (consumedEstimates.has(estimate.id)) continue;
      const step: TimelineStep = {
        id: estimate.id,
        type: 'estimate',
        title: `Calcul de preț ${estimate.number} — ${estimate.title}`,
        subtitle: `${Number(estimate.grandTotal).toLocaleString('ro-MD')} MDL`,
        status: estimate.status,
        at: estimate.updatedAt.toISOString(),
        meta: { estimateId: estimate.id },
      };
      groups.push({
        id: estimate.id,
        kind: 'request',
        title: step.title,
        status: estimate.status,
        statusType: 'estimate',
        at: step.at,
        steps: [step],
      });
    }

    for (const quote of quotes) {
      if (consumedQuotes.has(quote.id) || quote.interventionId) continue;
      const step: TimelineStep = {
        id: quote.id,
        type: 'quote',
        title: `Deviz ${quote.number}`,
        subtitle: `${Number(quote.total).toLocaleString('ro-MD')} MDL`,
        status: quote.status,
        at: quote.updatedAt.toISOString(),
        meta: { quoteId: quote.id },
      };
      groups.push({
        id: quote.id,
        kind: 'request',
        title: step.title,
        status: quote.status,
        statusType: 'quote',
        at: step.at,
        steps: [step],
      });
    }

    groups.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return { customer, groups };
  }
}
