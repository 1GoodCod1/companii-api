import type { InterventionStatus, InvoicePaymentStatus } from '@prisma/client';

export type AnalyticsPeriod = '30d' | '90d' | '12m';

export const ANALYTICS_PERIODS = ['30d', '90d', '12m'] as const;

export interface RevenueTrendPoint {
  bucketStart: string;
  invoiced: number;
  collected: number;
}

export interface InvoiceStatusSlice {
  status: InvoicePaymentStatus;
  count: number;
  amount: number;
}

export interface InterventionStatusSlice {
  status: InterventionStatus;
  count: number;
}

export interface SalesPipeline {
  leads: number;
  quotes: number;
  accepted: number;
  completed: number;
  paid: number;
}

export interface AnalyticsOverview {
  period: AnalyticsPeriod;
  generatedAt: string;
  revenueTrend: RevenueTrendPoint[];
  invoiceStatus: InvoiceStatusSlice[];
  interventionStatus: InterventionStatusSlice[];
  pipeline: SalesPipeline;
}
