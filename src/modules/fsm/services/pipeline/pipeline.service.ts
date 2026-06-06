import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type CompanyLeadStatus,
  type InterventionStatus,
  type QuoteStatus,
  type InvoicePaymentStatus,
} from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import { FsmContextService } from '../../context/fsm-context.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';

export const PIPELINE_ENTITIES = ['leads', 'interventions', 'quotes', 'invoices'] as const;
export type PipelineEntity = (typeof PIPELINE_ENTITIES)[number];

const PAGE_SIZE = 25;

const ENTITY_STATUSES: Record<PipelineEntity, readonly string[]> = {
  leads: ['NEW', 'CONTACTED', 'QUALIFIED', 'IN_PROGRESS', 'CONVERTED', 'LOST'],
  interventions: [
    'NEW',
    'SCHEDULED',
    'EN_ROUTE',
    'IN_PROGRESS',
    'COMPLETED',
    'INVOICED',
    'PAID',
    'CANCELLED',
  ],
  quotes: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED'],
  invoices: ['UNPAID', 'PENDING_CONFIRMATION', 'PAID', 'OVERDUE', 'CANCELLED'],
};

export interface BoardCard {
  id: string;
  status: string;
  title: string;
  subtitle: string | null;
  amount: number | null;
  meta: string | null;
}

export interface BoardColumn {
  status: string;
  total: number;
  cards: BoardCard[];
  nextCursor: string | null;
}

function toNum(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value);
}

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
  ) {}

  /** Full board for one entity: every status column with its total count and first page. */
  async getBoard(user: JwtPayload, entity: PipelineEntity) {
    this.assertEntity(entity);
    this.ctx.assertNotTechnician(user);
    const companyId = this.ctx.companyId(user);

    const counts = await this.countsByStatus(entity, companyId);
    const columns: BoardColumn[] = await Promise.all(
      ENTITY_STATUSES[entity].map(async (status) => {
        const { cards, nextCursor } = await this.fetchColumn(entity, companyId, status);
        return { status, total: counts[status] ?? 0, cards, nextCursor };
      }),
    );

    return { entity, columns };
  }

  /** Next page of a single column (load-more / infinite scroll). */
  async getColumn(
    user: JwtPayload,
    entity: PipelineEntity,
    status: string,
    cursor?: string,
  ) {
    this.assertEntity(entity);
    if (!ENTITY_STATUSES[entity].includes(status)) {
      throw AppErrors.badRequest(AppErrorMessages.VALIDATION_FAILED);
    }
    this.ctx.assertNotTechnician(user);
    const companyId = this.ctx.companyId(user);

    const { cards, nextCursor } = await this.fetchColumn(entity, companyId, status, cursor);
    return { status, cards, nextCursor };
  }

  private assertEntity(entity: string): asserts entity is PipelineEntity {
    if (!PIPELINE_ENTITIES.includes(entity as PipelineEntity)) {
      throw AppErrors.badRequest(AppErrorMessages.VALIDATION_FAILED);
    }
  }

  private async countsByStatus(
    entity: PipelineEntity,
    companyId: string,
  ): Promise<Record<string, number>> {
    switch (entity) {
      case 'leads': {
        const groups = await this.prisma.companyLead.groupBy({
          by: ['status'],
          where: { companyId },
          _count: { _all: true },
        });
        return Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
      }
      case 'interventions': {
        const groups = await this.prisma.intervention.groupBy({
          by: ['status'],
          where: { companyId },
          _count: { _all: true },
        });
        return Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
      }
      case 'quotes': {
        const groups = await this.prisma.quote.groupBy({
          by: ['status'],
          where: { companyId },
          _count: { _all: true },
        });
        return Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
      }
      case 'invoices': {
        const groups = await this.prisma.companyInvoice.groupBy({
          by: ['paymentStatus'],
          where: { companyId },
          _count: { _all: true },
        });
        return Object.fromEntries(groups.map((g) => [g.paymentStatus, g._count._all]));
      }
    }
  }

  private async fetchColumn(
    entity: PipelineEntity,
    companyId: string,
    status: string,
    cursor?: string,
  ): Promise<{ cards: BoardCard[]; nextCursor: string | null }> {
    const take = PAGE_SIZE + 1;

    switch (entity) {
      case 'leads': {
        const rows = await this.prisma.companyLead.findMany({
          where: { companyId, status: status as CompanyLeadStatus },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : 0,
          select: {
            id: true,
            status: true,
            contactName: true,
            contactPhone: true,
            serviceTitle: true,
            message: true,
            estimatedBudget: true,
          },
        });
        return this.paginate(rows, (r) => ({
          id: r.id,
          status: r.status,
          title: r.contactName,
          subtitle: r.serviceTitle ?? r.message ?? null,
          amount: toNum(r.estimatedBudget),
          meta: r.contactPhone,
        }));
      }
      case 'interventions': {
        const rows = await this.prisma.intervention.findMany({
          where: { companyId, status: status as InterventionStatus },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : 0,
          select: {
            id: true,
            status: true,
            number: true,
            type: true,
            address: true,
            estimatedPrice: true,
            finalPrice: true,
            customer: { select: { fullName: true } },
          },
        });
        return this.paginate(rows, (r) => ({
          id: r.id,
          status: r.status,
          title: r.customer?.fullName ?? r.type,
          subtitle: `#${r.number} · ${r.type}`,
          amount: toNum(r.finalPrice ?? r.estimatedPrice),
          meta: r.address,
        }));
      }
      case 'quotes': {
        const rows = await this.prisma.quote.findMany({
          where: { companyId, status: status as QuoteStatus },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : 0,
          select: {
            id: true,
            status: true,
            number: true,
            total: true,
            customer: { select: { fullName: true } },
          },
        });
        return this.paginate(rows, (r) => ({
          id: r.id,
          status: r.status,
          title: r.customer?.fullName ?? `#${r.number}`,
          subtitle: `#${r.number}`,
          amount: toNum(r.total),
          meta: null,
        }));
      }
      case 'invoices': {
        const rows = await this.prisma.companyInvoice.findMany({
          where: {
            companyId,
            paymentStatus: status as InvoicePaymentStatus,
          },
          orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
          take,
          cursor: cursor ? { id: cursor } : undefined,
          skip: cursor ? 1 : 0,
          select: {
            id: true,
            paymentStatus: true,
            number: true,
            amount: true,
            intervention: { select: { customer: { select: { fullName: true } } } },
          },
        });
        return this.paginate(rows, (r) => ({
          id: r.id,
          status: r.paymentStatus,
          title: r.intervention?.customer?.fullName ?? `#${r.number}`,
          subtitle: `#${r.number}`,
          amount: toNum(r.amount),
          meta: null,
        }));
      }
    }
  }

  private paginate<T extends { id: string }>(
    rows: T[],
    map: (row: T) => BoardCard,
  ): { cards: BoardCard[]; nextCursor: string | null } {
    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    return {
      cards: page.map(map),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }
}
