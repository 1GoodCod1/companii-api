import { Module } from '@nestjs/common';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';
import { AuditModule } from '../audit/audit.module';
import { CompaniesModule } from '../companies/companies.module';
import { CONSENT_REPOSITORY } from './domain/ports/consent.repository.port';
import { PrismaConsentRepository } from './infrastructure/persistence/prisma-consent.repository';

@Module({
  imports: [AuditModule, CompaniesModule],
  controllers: [ConsentController],
  providers: [
    ConsentService,
    {
      provide: CONSENT_REPOSITORY,
      useClass: PrismaConsentRepository,
    },
  ],
})
export class ConsentModule {}
