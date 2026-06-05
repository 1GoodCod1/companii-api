import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { SECURITY_ACTION_SET } from '../audit-action.enum';
import type { AuditLogData } from '../types/audit.types';

const AUDIT_STREAM_KEY = 'companii:audit:stream';
const AUDIT_STREAM_MAXLEN = 10_000;
const BATCH_INTERVAL_MS = 1_000;
const BATCH_SOFT_CAP = 50;
const BATCH_HARD_CAP = 500;

@Injectable()
export class AuditLogWriterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditLogWriterService.name);
  private buffer: AuditLogData[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, BATCH_INTERVAL_MS);
    this.flushTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.inFlight) {
      try {
        await this.inFlight;
      } catch {
        /* swallow — already logged */
      }
    }
    await this.flush();
  }

  log(data: AuditLogData): void {
    if (SECURITY_ACTION_SET.has(data.action)) {
      void this.persistSingle(data).catch((err) =>
        this.logger.error('Audit (sync) failed', err),
      );
      return;
    }

    if (this.buffer.length >= BATCH_HARD_CAP) {
      this.buffer.shift();
    }
    this.buffer.push(data);

    if (this.buffer.length >= BATCH_SOFT_CAP) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.inFlight) return await this.inFlight;
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];

    this.inFlight = (async () => {
      try {
        await this.prisma.runOutsideRlsContext(async () => {
          await this.prisma.auditLog.createMany({
            data: batch.map((entry) => ({
              userId: entry.userId ?? null,
              action: entry.action,
              entityType: entry.entityType,
              entityId: entry.entityId,
              oldData: entry.oldData as Prisma.InputJsonValue | undefined,
              newData: entry.newData as Prisma.InputJsonValue | undefined,
              ipAddress: entry.ipAddress,
              userAgent: entry.userAgent,
            })),
            skipDuplicates: false,
          });
        });
        await this.publishStreamBatch(batch);
      } catch (err) {
        this.logger.warn('Audit batch insert failed — retrying per-row');
        for (const entry of batch) {
          try {
            await this.persistSingle(entry);
          } catch (innerErr) {
            this.logger.error('Audit entry dropped', innerErr);
          }
        }
        void err;
      } finally {
        this.inFlight = null;
      }
    })();

    return await this.inFlight;
  }

  private async persistSingle(data: AuditLogData): Promise<void> {
    await this.prisma.runOutsideRlsContext(async () => {
      try {
        await this.prisma.auditLog.create({
          data: {
            userId: data.userId ?? null,
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId,
            oldData: data.oldData as Prisma.InputJsonValue | undefined,
            newData: data.newData as Prisma.InputJsonValue | undefined,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2003' &&
          data.userId
        ) {
          await this.prisma.auditLog.create({
            data: {
              userId: null,
              action: data.action,
              entityType: data.entityType,
              entityId: data.entityId,
              oldData: data.oldData as Prisma.InputJsonValue | undefined,
              newData: {
                ...((data.newData as Record<string, unknown>) ?? {}),
                _detachedUserId: data.userId,
              } as Prisma.InputJsonValue,
              ipAddress: data.ipAddress,
              userAgent: data.userAgent,
            },
          });
        } else {
          throw err;
        }
      }
    });
    await this.publishStreamBatch([data]);
    if (SECURITY_ACTION_SET.has(data.action)) {
      this.logger.warn(
        `[SECURITY] ${data.action} userId=${data.userId ?? 'null'} ip=${data.ipAddress ?? 'unknown'}`,
      );
    }
  }

  private async publishStreamBatch(entries: AuditLogData[]): Promise<void> {
    if (this.isShuttingDown) return;
    let client;
    try {
      client = this.redis.getClient();
    } catch {
      return;
    }
    const pipeline = client.pipeline();
    for (const entry of entries) {
      pipeline.xadd(
        AUDIT_STREAM_KEY,
        'MAXLEN',
        '~',
        AUDIT_STREAM_MAXLEN,
        '*',
        'action',
        entry.action,
        'userId',
        entry.userId ?? 'system',
        'timestamp',
        new Date().toISOString(),
      );
    }
    try {
      await pipeline.exec();
    } catch {
      this.logger.debug('Redis stream unavailable for audit');
    }
  }
}
