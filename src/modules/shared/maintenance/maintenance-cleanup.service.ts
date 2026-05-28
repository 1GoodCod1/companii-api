import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
@Injectable()
export class MaintenanceCleanupService {
  private readonly logger = new Logger(MaintenanceCleanupService.name);
  private static readonly LOCK_KEY = 0x636f_6d70;
  private static readonly PASSWORD_RESET_GRACE_DAYS = 30;
  private static readonly REFRESH_TOKEN_GRACE_DAYS = 7;

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredPasswordResetTokens(): Promise<void> {
    await this.withAdvisoryLock('password-reset', async () => {
      const cutoff = this.cutoffDate(
        MaintenanceCleanupService.PASSWORD_RESET_GRACE_DAYS,
      );
      const result = await this.prisma.passwordResetToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: cutoff } },
            { used: true, createdAt: { lt: cutoff } },
          ],
        },
      });
      if (result.count > 0) {
        this.logger.log(
          `Pruned ${result.count} expired password reset tokens (older than ${MaintenanceCleanupService.PASSWORD_RESET_GRACE_DAYS}d).`,
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
      const result = await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(
          `Pruned ${result.count} expired refresh tokens (older than ${MaintenanceCleanupService.REFRESH_TOKEN_GRACE_DAYS}d).`,
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
      const rows = await this.prisma.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_lock(${MaintenanceCleanupService.LOCK_KEY}::int, ${subKey}::int) AS locked
      `;
      const acquired = rows[0]?.locked === true;
      if (!acquired) {
        this.logger.debug(
          `[${jobName}] another replica holds the lock; skipping`,
        );
        return;
      }

      try {
        await job();
      } finally {
        await this.prisma.$executeRaw`
          SELECT pg_advisory_unlock(${MaintenanceCleanupService.LOCK_KEY}::int, ${subKey}::int)
        `;
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
