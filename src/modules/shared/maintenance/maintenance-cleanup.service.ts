import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MAINTENANCE_REPOSITORY } from './domain/ports/maintenance.repository.port';
import type { PrismaMaintenanceRepository } from './infrastructure/persistence/prisma-maintenance.repository';

@Injectable()
export class MaintenanceCleanupService {
  private readonly logger = new Logger(MaintenanceCleanupService.name);
  private static readonly LOCK_KEY = 0x636f_6d70;
  private static readonly PASSWORD_RESET_GRACE_DAYS = 30;
  private static readonly REFRESH_TOKEN_GRACE_DAYS = 7;

  constructor(
    @Inject(MAINTENANCE_REPOSITORY)
    private readonly maintenanceRepo: PrismaMaintenanceRepository,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredPasswordResetTokens(): Promise<void> {
    await this.withAdvisoryLock('password-reset', async () => {
      const cutoff = this.cutoffDate(
        MaintenanceCleanupService.PASSWORD_RESET_GRACE_DAYS,
      );
      const prunedCount = await this.maintenanceRepo.prunePasswordResetTokens(cutoff);
      if (prunedCount > 0) {
        this.logger.log(
          `Pruned ${prunedCount} expired password reset tokens (older than ${MaintenanceCleanupService.PASSWORD_RESET_GRACE_DAYS}d).`,
        );
      }
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredRefreshTokens(): Promise<void> {
    await this.withAdvisoryLock('refresh-token', async () => {
      const cutoff = this.cutoffDate(
        MaintenanceCleanupService.REFRESH_TOKEN_GRACE_DAYS,
      );
      const prunedCount = await this.maintenanceRepo.pruneRefreshTokens(cutoff);
      if (prunedCount > 0) {
        this.logger.log(
          `Pruned ${prunedCount} expired refresh tokens (older than ${MaintenanceCleanupService.REFRESH_TOKEN_GRACE_DAYS}d).`,
        );
      }
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async markOverdueInvoices(): Promise<void> {
    await this.withAdvisoryLock('invoice-overdue', async () => {
      const now = new Date();
      const markedCount = await this.maintenanceRepo.markOverdueInvoices(now);
      if (markedCount > 0) {
        this.logger.log(
          `Marked ${markedCount} invoices as OVERDUE (dueDate before ${now.toISOString()}).`,
        );
      }
    });
  }

  private cutoffDate(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  private async withAdvisoryLock(
    jobName: string,
    job: () => Promise<void>,
  ): Promise<void> {
    const subKey = this.hashString(jobName);
    try {
      const acquired = await this.maintenanceRepo.tryAdvisoryLock(
        MaintenanceCleanupService.LOCK_KEY,
        subKey,
      );
      if (!acquired) {
        this.logger.debug(
          `[${jobName}] another replica holds the lock; skipping`,
        );
        return;
      }

      try {
        await job();
      } finally {
        await this.maintenanceRepo.advisoryUnlock(
          MaintenanceCleanupService.LOCK_KEY,
          subKey,
        );
      }
    } catch (err) {
      this.logger.error(
        `[${jobName}] cleanup failed`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  private hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash & 0x7fffffff;
  }
}
