import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { FsmContextService } from '../../context/fsm-context.service';
import { CacheService } from '../../../shared/cache/cache.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import {
  bucketKey,
  bucketStartFor,
  buildBuckets,
  granularityFor,
  windowStartFor,
} from './analytics-buckets.util';
import type {
  AnalyticsOverview,
  AnalyticsPeriod,
  InterventionStatusSlice,
  InvoiceStatusSlice,
  RevenueTrendPoint,
  SalesPipeline,
} from './analytics.types';

const DEFAULT_PERIOD: AnalyticsPeriod = '12m';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

type RevenueInvoiceRow = {
  issuedAt: Date;
  amount: Prisma.Decimal;
  tvaAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
};

@Injectable()
export class FsmAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
    private readonly cache: CacheService,
  ) {}

  async getOverview(user: JwtPayload, period: AnalyticsPeriod = DEFAULT_PERIOD): Promise<AnalyticsOverview> {
    this.ctx.assertNotTechnician(user);
    const companyId = this.ctx.companyId(user);
    return this.cache.getOrSet(
      this.cache.keys.analyticsOverview(companyId, period),
      async () => {
        const now = new Date();
        const windowStart = windowStartFor(period, now);
        const revenueRows = await this.prisma.companyInvoice.findMany({
          where: { companyId, issuedAt: { gte: windowStart }, paymentStatus: { not: 'CANCELLED' } },
          select: { issuedAt: true, amount: true, tvaAmount: true, paidAmount: true },
        });

        const invoiceStatusGroups = await this.prisma.companyInvoice.groupBy({
          by: ['paymentStatus'],
          where: { companyId, paymentStatus: { not: 'CANCELLED' } },
          _count: { _all: true },
          _sum: { amount: true, tvaAmount: true },
          orderBy: { paymentStatus: 'asc' },
        });

        const interventionStatusGroups = await this.prisma.intervention.groupBy({
          by: ['status'],
          where: { companyId },
          _count: { _all: true },
          orderBy: { status: 'asc' },
        });

        const leads = await this.prisma.companyLead.count({
          where: { companyId, createdAt: { gte: windowStart } },
        });
        const quotes = await this.prisma.quote.count({
          where: { companyId, createdAt: { gte: windowStart } },
        });
        const accepted = await this.prisma.quote.count({
          where: { companyId, createdAt: { gte: windowStart }, status: { in: ['ACCEPTED', 'CONVERTED'] } },
        });
        const completed = await this.prisma.intervention.count({
          where: { companyId, createdAt: { gte: windowStart }, status: { in: ['COMPLETED', 'INVOICED', 'PAID'] } },
        });
        const paid = await this.prisma.companyInvoice.count({
          where: { companyId, issuedAt: { gte: windowStart }, paymentStatus: 'PAID' },
        });

        const revenueTrend = this.buildRevenueTrend(revenueRows, period, now);

        const invoiceStatus: InvoiceStatusSlice[] = invoiceStatusGroups.map((g) => ({
          status: g.paymentStatus,
          count: g._count._all,
          amount: round2(Number(g._sum.amount ?? 0) + Number(g._sum.tvaAmount ?? 0)),
        }));

        const interventionStatus: InterventionStatusSlice[] = interventionStatusGroups.map((g) => ({
          status: g.status,
          count: g._count._all,
        }));

        const pipeline: SalesPipeline = { leads, quotes, accepted, completed, paid };

        return {
          period,
          generatedAt: now.toISOString(),
          revenueTrend,
          invoiceStatus,
          interventionStatus,
          pipeline,
        };
      },
      this.cache.ttl.analyticsOverview,
    );
  }

  private buildRevenueTrend(
    rows: RevenueInvoiceRow[],
    period: AnalyticsPeriod,
    now: Date,
  ): RevenueTrendPoint[] {
    const granularity = granularityFor(period);
    const points = new Map<string, { invoiced: number; collected: number }>();
    for (const bucket of buildBuckets(period, now)) {
      points.set(bucketKey(bucket), { invoiced: 0, collected: 0 });
    }

    for (const row of rows) {
      const key = bucketKey(bucketStartFor(row.issuedAt, granularity));
      const point = points.get(key);
      if (!point) continue;
      point.invoiced += Number(row.amount) + Number(row.tvaAmount);
      point.collected += Number(row.paidAmount);
    }

    return Array.from(points.entries()).map(([bucketStart, value]) => ({
      bucketStart,
      invoiced: round2(value.invoiced),
      collected: round2(value.collected),
    }));
  }
}
