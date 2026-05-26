import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../database/prisma.module';
import { MaintenanceCleanupService } from './maintenance-cleanup.service';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [MaintenanceCleanupService],
  exports: [MaintenanceCleanupService],
})
export class MaintenanceModule {}
