import type { Prisma } from '@prisma/client';

export interface AuditLogData {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  oldData?: Prisma.InputJsonValue;
  newData?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}
