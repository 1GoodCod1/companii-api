import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

import { PAYMENTS_REPOSITORY } from './domain/ports/payments.repository.port';
import { PrismaPaymentsRepository } from './infrastructure/persistence/prisma-payments.repository';

@Module({
  imports: [CompaniesModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PrismaPaymentsRepository,
    {
      provide: PAYMENTS_REPOSITORY,
      useExisting: PrismaPaymentsRepository,
    },
  ],
})
export class PaymentsModule {}
