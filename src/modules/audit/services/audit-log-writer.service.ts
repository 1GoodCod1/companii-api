import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { SECURITY_ACTION_SET } from '../audit-action.enum';
import type { AuditLogData } from '../types/audit.types';
import { rlsTxStorage } from '../../../common/rls/rls.storage';

@Injectable()
export class AuditLogWriterService {
  private readonly logger = new Logger(AuditLogWriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async log(data: AuditLogData) {
    return rlsTxStorage.run(undefined, async () => {
      try {
        let userId = data.userId;
        if (userId) {
          const exists = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
          });
          if (!exists) userId = null;
        }

        const log = await this.prisma.auditLog.create({
          data: {
            userId: userId ?? null,
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId,
            oldData: data.oldData,
            newData: data.newData,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
          },
        });

        await this.publishToStream(data, userId);
        if (SECURITY_ACTION_SET.has(data.action)) {
          this.logger.warn(`[SECURITY] ${data.action}`, {
            userId,
            ipAddress: data.ipAddress,
          });
        }
        return log;
      } catch (error) {
        this.logger.error('Failed to persist audit log', error);
      }
    });
  }

  private async publishToStream(
    data: AuditLogData,
    userId: string | null | undefined,
  ): Promise<void> {
    try {
      await this.redis.getClient().xadd(
        'companii:audit:stream',
        '*',
        'action',
        data.action,
        'userId',
        userId || 'system',
        'timestamp',
        new Date().toISOString(),
      );
    } catch {
      this.logger.debug('Redis stream unavailable for audit');
    }
  }
}
