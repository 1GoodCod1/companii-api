import { Module } from '@nestjs/common';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';
import { AuditModule } from '../audit/audit.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [AuditModule, CompaniesModule],
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
