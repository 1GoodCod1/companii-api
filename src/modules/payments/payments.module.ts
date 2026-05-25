import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [CompaniesModule],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
