import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { MaintenanceRepository } from '../../domain/ports/maintenance.repository.port';

@Injectable()
export class PrismaMaintenanceRepository implements MaintenanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async tryAdvisoryLock(lockKey: number, subKey: number): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(${lockKey}::int, ${subKey}::int) AS locked
    `;
    return rows[0]?.locked === true;
  }

  async advisoryUnlock(lockKey: number, subKey: number): Promise<void> {
    await this.prisma.$executeRaw`
      SELECT pg_advisory_unlock(${lockKey}::int, ${subKey}::int)
    `;
  }

  async prunePasswordResetTokens(cutoff: Date): Promise<number> {
    const result = await this.prisma.passwordResetToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff } },
          { used: true, createdAt: { lt: cutoff } },
        ],
      },
    });
    return result.count;
  }

  async pruneRefreshTokens(cutoff: Date): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    return result.count;
  }

  async markOverdueInvoices(now: Date): Promise<number> {
    const result = await this.prisma.companyInvoice.updateMany({
      where: {
        paymentStatus: 'UNPAID',
        dueDate: { not: null, lt: now },
      },
      data: { paymentStatus: 'OVERDUE' },
    });
    return result.count;
  }
}
