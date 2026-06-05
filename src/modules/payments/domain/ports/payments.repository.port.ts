import type {
  Prisma,
  Payment,
  CompanyPlan,
  CompanySubscriptionPlan,
} from '@prisma/client';

export const PAYMENTS_REPOSITORY = Symbol('PaymentsRepository');

export interface PaymentsRepository {
  create(data: Prisma.PaymentCreateInput): Promise<Payment>;
  updateStatus(externalId: string, status: string): Promise<Prisma.BatchPayload>;
  findPlanByCode(code: CompanySubscriptionPlan): Promise<CompanyPlan | null>;
}
