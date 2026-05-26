import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { FsmService } from './fsm.service';
import { FsmController } from './fsm.controller';
import { LeadsService } from './leads.service';
import { InvoicePdfModule } from './invoice-pdf.module';

import { CustomerImportService } from './customer-import/customer-import.service';

@Module({
  imports: [AuthModule, CompaniesModule, InvoicePdfModule],
  controllers: [FsmController],
  providers: [FsmService, LeadsService, CustomerImportService],
  exports: [FsmService, LeadsService, CustomerImportService],
})
export class FsmModule {}
