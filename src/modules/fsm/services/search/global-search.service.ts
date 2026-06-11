import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { FsmContextService } from '../../context/fsm-context.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';

export const SEARCH_ENTITY_TYPES = [
  'customer',
  'lead',
  'intervention',
  'quote',
  'invoice',
  'estimate',
  'service',
] as const;

export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

export interface GlobalSearchItem {
  type: SearchEntityType;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  createdAt: Date;
}

export interface GlobalSearchGroup {
  type: SearchEntityType;
  total: number;
  items: GlobalSearchItem[];
}

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const PER_TYPE_LIMIT = 5;

@Injectable()
export class GlobalSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
  ) {}

  async search(user: JwtPayload, rawQuery: string): Promise<{ query: string; groups: GlobalSearchGroup[] }> {
    const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
    if (query.length < MIN_QUERY_LENGTH) {
      return { query, groups: [] };
    }

    const cid = this.ctx.companyId(user);
    const isTechnician = this.ctx.isTechnician(user);
    const contains = { contains: query, mode: 'insensitive' } satisfies Prisma.StringFilter<never>;
    const managementOnly = <T>(factory: () => Promise<T>, empty: T) =>
      isTechnician ? () => Promise.resolve(empty) : factory;

    const interventionWhere: Prisma.InterventionWhereInput = {
      companyId: cid,
      ...this.ctx.technicianInterventionFilter(user),
      OR: [
        { number: contains },
        { type: contains },
        { description: contains },
        { address: contains },
        { customer: { fullName: contains } },
      ],
    };
    const customerWhere: Prisma.CompanyCustomerWhereInput = {
      companyId: cid,
      OR: [
        { fullName: contains },
        { phone: contains },
        { email: contains },
        { address: contains },
      ],
    };
    const leadWhere: Prisma.CompanyLeadWhereInput = {
      companyId: cid,
      OR: [
        { contactName: contains },
        { contactPhone: contains },
        { contactEmail: contains },
        { serviceTitle: contains },
        { message: contains },
      ],
    };
    const quoteWhere: Prisma.QuoteWhereInput = {
      companyId: cid,
      OR: [{ number: contains }, { customer: { fullName: contains } }],
    };
    const invoiceWhere: Prisma.CompanyInvoiceWhereInput = {
      companyId: cid,
      OR: [
        { number: contains },
        { intervention: { customer: { fullName: contains } } },
      ],
    };
    const estimateWhere: Prisma.EstimateProjectWhereInput = {
      companyId: cid,
      OR: [
        { number: contains },
        { title: contains },
        { address: contains },
        { customer: { fullName: contains } },
      ],
    };
    const serviceWhere: Prisma.CompanyServiceWhereInput = {
      companyId: cid,
      OR: [{ name: contains }, { description: contains }],
    };

    const [
      customers,
      customersTotal,
      leads,
      leadsTotal,
      interventions,
      interventionsTotal,
      quotes,
      quotesTotal,
      invoices,
      invoicesTotal,
      estimates,
      estimatesTotal,
      services,
      servicesTotal,
    ] = await this.prisma.inSerial([
      managementOnly(
        () =>
          this.prisma.companyCustomer.findMany({
            where: customerWhere,
            select: { id: true, fullName: true, phone: true, email: true, createdAt: true },
            orderBy: { updatedAt: 'desc' },
            take: PER_TYPE_LIMIT,
          }),
        [],
      ),
      managementOnly(() => this.prisma.companyCustomer.count({ where: customerWhere }), 0),
      managementOnly(
        () =>
          this.prisma.companyLead.findMany({
            where: leadWhere,
            select: {
              id: true,
              contactName: true,
              contactPhone: true,
              serviceTitle: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: PER_TYPE_LIMIT,
          }),
        [],
      ),
      managementOnly(() => this.prisma.companyLead.count({ where: leadWhere }), 0),
      () =>
        this.prisma.intervention.findMany({
          where: interventionWhere,
          select: {
            id: true,
            number: true,
            type: true,
            status: true,
            createdAt: true,
            customer: { select: { fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: PER_TYPE_LIMIT,
        }),
      () => this.prisma.intervention.count({ where: interventionWhere }),
      managementOnly(
        () =>
          this.prisma.quote.findMany({
            where: quoteWhere,
            select: {
              id: true,
              number: true,
              status: true,
              total: true,
              createdAt: true,
              customer: { select: { fullName: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: PER_TYPE_LIMIT,
          }),
        [],
      ),
      managementOnly(() => this.prisma.quote.count({ where: quoteWhere }), 0),
      managementOnly(
        () =>
          this.prisma.companyInvoice.findMany({
            where: invoiceWhere,
            select: {
              id: true,
              number: true,
              paymentStatus: true,
              amount: true,
              tvaAmount: true,
              issuedAt: true,
              intervention: { select: { customer: { select: { fullName: true } } } },
            },
            orderBy: { issuedAt: 'desc' },
            take: PER_TYPE_LIMIT,
          }),
        [],
      ),
      managementOnly(() => this.prisma.companyInvoice.count({ where: invoiceWhere }), 0),
      managementOnly(
        () =>
          this.prisma.estimateProject.findMany({
            where: estimateWhere,
            select: {
              id: true,
              number: true,
              title: true,
              status: true,
              grandTotal: true,
              createdAt: true,
              customer: { select: { fullName: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: PER_TYPE_LIMIT,
          }),
        [],
      ),
      managementOnly(() => this.prisma.estimateProject.count({ where: estimateWhere }), 0),
      managementOnly(
        () =>
          this.prisma.companyService.findMany({
            where: serviceWhere,
            select: { id: true, name: true, defaultPrice: true, currency: true, createdAt: true },
            orderBy: { sortOrder: 'asc' },
            take: PER_TYPE_LIMIT,
          }),
        [],
      ),
      managementOnly(() => this.prisma.companyService.count({ where: serviceWhere }), 0),
    ]);

    const groups: GlobalSearchGroup[] = [
      {
        type: 'customer' as const,
        total: customersTotal,
        items: customers.map((c) => ({
          type: 'customer' as const,
          id: c.id,
          title: c.fullName,
          subtitle: [c.phone, c.email].filter(Boolean).join(' · ') || null,
          status: null,
          createdAt: c.createdAt,
        })),
      },
      {
        type: 'lead' as const,
        total: leadsTotal,
        items: leads.map((l) => ({
          type: 'lead' as const,
          id: l.id,
          title: l.contactName,
          subtitle: [l.serviceTitle, l.contactPhone].filter(Boolean).join(' · ') || null,
          status: l.status,
          createdAt: l.createdAt,
        })),
      },
      {
        type: 'intervention' as const,
        total: interventionsTotal,
        items: interventions.map((i) => ({
          type: 'intervention' as const,
          id: i.id,
          title: `${i.number} · ${i.type}`,
          subtitle: i.customer?.fullName ?? null,
          status: i.status,
          createdAt: i.createdAt,
        })),
      },
      {
        type: 'quote' as const,
        total: quotesTotal,
        items: quotes.map((q) => ({
          type: 'quote' as const,
          id: q.id,
          title: q.number,
          subtitle: [q.customer?.fullName, `${Number(q.total).toLocaleString('ro-MD')} MDL`]
            .filter(Boolean)
            .join(' · ') || null,
          status: q.status,
          createdAt: q.createdAt,
        })),
      },
      {
        type: 'invoice' as const,
        total: invoicesTotal,
        items: invoices.map((inv) => ({
          type: 'invoice' as const,
          id: inv.id,
          title: inv.number,
          subtitle: [
            inv.intervention?.customer?.fullName,
            `${(Number(inv.amount) + Number(inv.tvaAmount)).toLocaleString('ro-MD')} MDL`,
          ]
            .filter(Boolean)
            .join(' · ') || null,
          status: inv.paymentStatus,
          createdAt: inv.issuedAt,
        })),
      },
      {
        type: 'estimate' as const,
        total: estimatesTotal,
        items: estimates.map((e) => ({
          type: 'estimate' as const,
          id: e.id,
          title: `${e.number} · ${e.title}`,
          subtitle: [e.customer?.fullName, `${Number(e.grandTotal).toLocaleString('ro-MD')} MDL`]
            .filter(Boolean)
            .join(' · ') || null,
          status: e.status,
          createdAt: e.createdAt,
        })),
      },
      {
        type: 'service' as const,
        total: servicesTotal,
        items: services.map((s) => ({
          type: 'service' as const,
          id: s.id,
          title: s.name,
          subtitle: `${Number(s.defaultPrice).toLocaleString('ro-MD')} ${s.currency}`,
          status: null,
          createdAt: s.createdAt,
        })),
      },
    ].filter((group) => group.items.length > 0);

    return { query, groups };
  }
}
