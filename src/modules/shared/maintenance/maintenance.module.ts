import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../database/prisma.module';
import { MaintenanceCleanupService } from './maintenance-cleanup.service';

import { MAINTENANCE_REPOSITORY } from './domain/ports/maintenance.repository.port';
import { PrismaMaintenanceRepository } from './infrastructure/persistence/prisma-maintenance.repository';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [
    MaintenanceCleanupService,
    PrismaMaintenanceRepository,
    {
      provide: MAINTENANCE_REPOSITORY,
      useExisting: PrismaMaintenanceRepository,
    },
  ],
})
export class MaintenanceModule {}
