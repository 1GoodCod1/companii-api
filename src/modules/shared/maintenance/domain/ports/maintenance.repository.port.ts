export const MAINTENANCE_REPOSITORY = Symbol('MaintenanceRepository');

export interface MaintenanceRepository {
  tryAdvisoryLock(lockKey: number, subKey: number): Promise<boolean>;
  advisoryUnlock(lockKey: number, subKey: number): Promise<void>;
  prunePasswordResetTokens(cutoff: Date): Promise<number>;
  pruneRefreshTokens(cutoff: Date): Promise<number>;
  markOverdueInvoices(now: Date): Promise<number>;
}
