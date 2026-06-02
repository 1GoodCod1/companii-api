import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { AuditModule } from '../audit/audit.module';
import { CompanyAuthorizationModule } from '../companies/authorization/company-authorization.module';
import { SUBSCRIPTIONS_REPOSITORY } from './domain/ports/subscriptions.repository.port';
import { PrismaSubscriptionsRepository } from './infrastructure/persistence/prisma-subscriptions.repository';

@Module({
  imports: [AuditModule, CompanyAuthorizationModule],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    {
      provide: SUBSCRIPTIONS_REPOSITORY,
      useClass: PrismaSubscriptionsRepository,
    },
  ],
})
export class SubscriptionsModule {}
