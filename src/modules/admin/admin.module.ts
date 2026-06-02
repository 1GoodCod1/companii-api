import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from '@/common/guards/roles.guard';
import { AuditModule } from '../audit/audit.module';
import { AdminClientsService } from './services/admin-clients.service';
import { AdminCompaniesService } from './services/admin-companies.service';
import { AdminModerationService } from './services/admin-moderation.service';
import { AdminReferenceDataService } from './services/admin-reference-data.service';
import { AdminStatsService } from './services/admin-stats.service';
import { AdminBlueprintsService } from './services/admin-blueprints.service';

import { ADMIN_REPOSITORY } from './domain/ports/admin.repository.port';
import { PrismaAdminRepository } from './infrastructure/persistence/prisma-admin.repository';

@Module({
  imports: [AuditModule],
  controllers: [AdminController],
  providers: [
    AdminCompaniesService,
    AdminModerationService,
    AdminReferenceDataService,
    AdminStatsService,
    AdminClientsService,
    AdminBlueprintsService,
    AdminService,
    RolesGuard,
    PrismaAdminRepository,
    {
      provide: ADMIN_REPOSITORY,
      useExisting: PrismaAdminRepository,
    },
  ],
})
export class AdminModule {}
