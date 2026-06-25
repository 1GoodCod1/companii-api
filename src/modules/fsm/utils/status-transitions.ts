import type {
  InterventionStatus,
  InvoicePaymentStatus,
  QuoteStatus,
  CompanyRole,
  CompanyLeadStatus,
} from '@prisma/client';

const LEAD_TRANSITIONS: Record<CompanyLeadStatus, CompanyLeadStatus[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'LOST'],
  CONTACTED: ['NEW', 'QUALIFIED', 'IN_PROGRESS', 'LOST'],
  QUALIFIED: ['CONTACTED', 'IN_PROGRESS', 'LOST'],
  IN_PROGRESS: ['QUALIFIED', 'CONVERTED', 'LOST'],
  CONVERTED: [],
  LOST: ['NEW'],
};

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
  UNPAID: ['PAID', 'OVERDUE', 'CANCELLED', 'PENDING_CONFIRMATION'],
  OVERDUE: ['PAID', 'CANCELLED', 'PENDING_CONFIRMATION'],
  PENDING_CONFIRMATION: ['PAID', 'UNPAID', 'OVERDUE', 'CANCELLED'],
  PAID: ['UNPAID'],
  CANCELLED: [],
};

const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SENT', 'ACCEPTED', 'REJECTED'],
  SENT: ['ACCEPTED', 'REJECTED', 'DRAFT'],
  ACCEPTED: ['REJECTED'],
  REJECTED: ['DRAFT'],
  CONVERTED: [],
};

export function isClosedLeadStatus(status: CompanyLeadStatus): boolean {
  return status === 'CONVERTED' || status === 'LOST';
}

export function getAllowedLeadTransitions(from: CompanyLeadStatus): CompanyLeadStatus[] {
  if (isClosedLeadStatus(from) && from !== 'LOST') return [];
  return LEAD_TRANSITIONS[from] ?? [];
}

export function assertLeadTransition(
  from: CompanyLeadStatus,
  to: CompanyLeadStatus,
  opts?: { allowConverted?: boolean },
): void {
  if (from === to) {
    throw new Error('STATUS_UNCHANGED');
  }
  if (to === 'CONVERTED' && !opts?.allowConverted) {
    throw new Error('STATUS_SYSTEM_ONLY');
  }
  const allowed = getAllowedLeadTransitions(from);
  if (!allowed.includes(to)) {
    throw new Error('STATUS_TRANSITION_INVALID');
  }
}

export function isTerminalInterventionStatus(status: InterventionStatus): boolean {
  return status === 'PAID' || status === 'CANCELLED';
}

export function isTerminalPaymentStatus(_status: InvoicePaymentStatus): boolean {
  return false;
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

export function getAllowedQuoteTransitions(from: QuoteStatus): QuoteStatus[] {
  return QUOTE_TRANSITIONS[from] ?? [];
}

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (from === to) {
    throw new Error('STATUS_UNCHANGED');
  }
  if (to === 'CONVERTED') {
    throw new Error('STATUS_SYSTEM_ONLY');
  }
  if (!QUOTE_TRANSITIONS[from]?.includes(to)) {
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
