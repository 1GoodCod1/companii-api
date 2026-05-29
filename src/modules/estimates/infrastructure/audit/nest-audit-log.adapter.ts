import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../../../audit/audit.service';
import type { AuditLog } from '../../domain/ports/audit-log.port';
import { AuditAction } from '../../../audit/audit-action.enum';
import { AuditEntityType } from '../../../audit/audit-entity-type.enum';

@Injectable()
export class NestAuditLog implements AuditLog {
  constructor(private readonly audit: AuditService) {}

  async log(params: { userId: string; action: string; entityType: string; entityId: string; newData?: Record<string, unknown> }): Promise<void> {
    await this.audit.log({
      userId: params.userId,
      action: params.action as AuditAction,
      entityType: params.entityType as AuditEntityType,
      entityId: params.entityId,
      newData: params.newData as Prisma.InputJsonValue | undefined,
    });
  }
}