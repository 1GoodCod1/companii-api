import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { AuditModule } from '../audit/audit.module';
import { CompanyAuthorizationModule } from '../companies/authorization/company-authorization.module';

@Module({
  imports: [AuditModule, CompanyAuthorizationModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
