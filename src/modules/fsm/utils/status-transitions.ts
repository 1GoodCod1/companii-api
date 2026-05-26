import type { InterventionStatus, InvoicePaymentStatus, CompanyRole } from '@prisma/client';

const MANAGEMENT_TRANSITIONS: Record<InterventionStatus, InterventionStatus[]> = {
  NEW: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['EN_ROUTE', 'CANCELLED'],
  EN_ROUTE: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  INVOICED: [],
  PAID: [],
  CANCELLED: [],
};

const TECHNICIAN_TRANSITIONS: Record<InterventionStatus, InterventionStatus[]> = {
  NEW: ['SCHEDULED'],
  SCHEDULED: ['EN_ROUTE'],
  EN_ROUTE: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  INVOICED: [],
  PAID: [],
  CANCELLED: [],
};

const PAYMENT_TRANSITIONS: Record<InvoicePaymentStatus, InvoicePaymentStatus[]> = {
  UNPAID: ['PAID', 'OVERDUE'],
  OVERDUE: ['PAID'],
  PAID: [],
};

export function isTerminalInterventionStatus(status: InterventionStatus): boolean {
  return status === 'PAID' || status === 'CANCELLED';
}

export function isTerminalPaymentStatus(status: InvoicePaymentStatus): boolean {
  return status === 'PAID';
}

export function getAllowedInterventionTransitions(
  from: InterventionStatus,
  role?: CompanyRole | 'PLATFORM_ADMIN',
): InterventionStatus[] {
  if (isTerminalInterventionStatus(from)) return [];
  if (from === 'INVOICED') return [];
  if (role === 'MEMBER') return TECHNICIAN_TRANSITIONS[from] ?? [];
  return MANAGEMENT_TRANSITIONS[from] ?? [];
}

export function assertInterventionTransition(
  from: InterventionStatus,
  to: InterventionStatus,
  role?: CompanyRole | 'PLATFORM_ADMIN',
): void {
  if (from === to) {
    throw new Error('STATUS_UNCHANGED');
  }
  if (to === 'INVOICED' || to === 'PAID') {
    throw new Error('STATUS_SYSTEM_ONLY');
  }
  const allowed = getAllowedInterventionTransitions(from, role);
  if (!allowed.includes(to)) {
    throw new Error('STATUS_TRANSITION_INVALID');
  }
}

export function getAllowedPaymentTransitions(
  from: InvoicePaymentStatus,
): InvoicePaymentStatus[] {
  if (isTerminalPaymentStatus(from)) return [];
  return PAYMENT_TRANSITIONS[from] ?? [];
}

export function assertPaymentTransition(
  from: InvoicePaymentStatus,
  to: InvoicePaymentStatus,
): void {
  if (from === to) {
    throw new Error('STATUS_UNCHANGED');
  }
  const allowed = getAllowedPaymentTransitions(from);
  if (!allowed.includes(to)) {
    throw new Error('STATUS_TRANSITION_INVALID');
  }
}
