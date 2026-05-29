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

export function isEstimateRecalculable(status: EstimateProjectStatus): boolean {
  return RECALCULABLE_ESTIMATE_STATUSES.has(status);
}

export function isTerminalEstimateStatus(status: EstimateProjectStatus): boolean {
  return status === EstimateProjectStatus.DONE || status === EstimateProjectStatus.CANCELLED;
}

export function getAllowedEstimateTransitions(
  from: EstimateProjectStatus,
): EstimateProjectStatus[] {
  return ESTIMATE_TRANSITIONS[from] ?? [];
}

export function canTransitionEstimate(
  from: EstimateProjectStatus,
  to: EstimateProjectStatus,
): boolean {
  if (from === to) return true;
  return getAllowedEstimateTransitions(from).includes(to);
}

/** Throws with a stable code when the transition is not allowed. */
export function assertEstimateTransition(
  from: EstimateProjectStatus,
  to: EstimateProjectStatus,
): void {
  if (from === to) return;
  if (!getAllowedEstimateTransitions(from).includes(to)) {
    throw new Error(`ESTIMATE_TRANSITION_INVALID:${from}->${to}`);
  }
}
