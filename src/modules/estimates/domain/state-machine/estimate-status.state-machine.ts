import { EstimateProjectStatus } from '@prisma/client';

const ESTIMATE_TRANSITIONS: Record<EstimateProjectStatus, EstimateProjectStatus[]> = {
  DRAFT: ['MEASURED', 'CALCULATED', 'CANCELLED'],
  MEASURED: ['CALCULATED', 'CANCELLED'],
  CALCULATED: ['APPROVED', 'SENT', 'CANCELLED'],
  APPROVED: ['SENT', 'CALCULATED', 'CANCELLED'],
  SENT: ['ACCEPTED', 'CALCULATED', 'CANCELLED'],
  ACCEPTED: ['IN_EXECUTION', 'CANCELLED'],
  IN_EXECUTION: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

export const RECALCULABLE_ESTIMATE_STATUSES: ReadonlySet<EstimateProjectStatus> = new Set([
  EstimateProjectStatus.DRAFT,
  EstimateProjectStatus.MEASURED,
  EstimateProjectStatus.CALCULATED,
  EstimateProjectStatus.APPROVED,
]);

export class EstimateStatusStateMachine {
  static getAllowedTransitions(from: EstimateProjectStatus): EstimateProjectStatus[] {
    return ESTIMATE_TRANSITIONS[from] ?? [];
  }

  static canTransition(from: EstimateProjectStatus, to: EstimateProjectStatus): boolean {
    if (from === to) return true;
    return this.getAllowedTransitions(from).includes(to);
  }

  static assertTransition(from: EstimateProjectStatus, to: EstimateProjectStatus): void {
    if (from === to) return;
    if (!this.canTransition(from, to)) {
      throw new Error(`ESTIMATE_TRANSITION_INVALID:${from}->${to}`);
    }
  }

  static isRecalculable(status: EstimateProjectStatus): boolean {
    return RECALCULABLE_ESTIMATE_STATUSES.has(status);
  }

  static isTerminal(status: EstimateProjectStatus): boolean {
    return status === EstimateProjectStatus.DONE || status === EstimateProjectStatus.CANCELLED;
  }
}