import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CompanySubscriptionPlan, PaymentProductType } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { PAYMENTS_REPOSITORY } from './domain/ports/payments.repository.port';
import type { PrismaPaymentsRepository } from './infrastructure/persistence/prisma-payments.repository';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENTS_REPOSITORY)
    private readonly paymentsRepo: PrismaPaymentsRepository,
  ) {}

  async createSubscriptionCheckout(
    companyId: string,
    planCode: CompanySubscriptionPlan,
  ) {
    if (planCode === CompanySubscriptionPlan.FREE) {
      throw AppErrors.badRequest(AppErrorMessages.SUBSCRIPTION_PLAN_REQUIRED);
    }
    const plan = await this.paymentsRepo.findPlanByCode(planCode);
    if (!plan) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.paymentsRepo.create({
      companyId,
      productType: PaymentProductType.COMPANY_SUBSCRIPTION,
      amount: plan.price,
      currency: plan.currency,
      status: 'PENDING',
      externalId: `sub_${randomBytes(24).toString('hex')}`,
    });
  }

  handleWebhook(externalId: string, status: string) {
    return this.paymentsRepo.updateStatus(externalId, status);
  }
}
