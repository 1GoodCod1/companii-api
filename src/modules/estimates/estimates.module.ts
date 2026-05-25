import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { InvoicePdfModule } from '../fsm/invoice-pdf.module';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './estimates.service';
import { EstimatePricingEngine } from './pricing-engine.service';

@Module({
  imports: [AuthModule, CompaniesModule, InvoicePdfModule],
  controllers: [EstimatesController],
  providers: [EstimatesService, EstimatePricingEngine],
  exports: [EstimatesService],
})
export class EstimatesModule {}
