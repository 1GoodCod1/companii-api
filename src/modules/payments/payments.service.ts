import { Inject, Injectable } from '@nestjs/common';
import { PaymentProductType } from '@prisma/client';
import { PAYMENTS_REPOSITORY } from './domain/ports/payments.repository.port';
import type { PrismaPaymentsRepository } from './infrastructure/persistence/prisma-payments.repository';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENTS_REPOSITORY)
    private readonly paymentsRepo: PrismaPaymentsRepository,
  ) {}

  createSubscriptionCheckout(companyId: string, planCode: string, amount: number) {
    return this.paymentsRepo.create({
      companyId,
      productType: PaymentProductType.COMPANY_SUBSCRIPTION,
      amount,
      status: 'PENDING',
      externalId: `sub_${Date.now()}`,
    });
  }

  handleWebhook(externalId: string, status: string) {
    return this.paymentsRepo.updateStatus(externalId, status);
  }
}
