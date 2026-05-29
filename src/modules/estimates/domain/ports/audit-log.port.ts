export const AUDIT_LOG = Symbol('AuditLog');

export interface AuditLog {
  log(params: {
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    newData?: Record<string, unknown>;
  }): Promise<void>;
}