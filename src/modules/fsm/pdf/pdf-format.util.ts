import type { InvoicePaymentStatus } from '@prisma/client';

export function formatMoney(value: number): string {
  return `${value.toLocaleString('ro-MD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL`;
}

export function formatDate(value: Date, locale: string = 'ro-MD'): string {
  return value.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
}

export function paymentStatusRoLabel(status: InvoicePaymentStatus): string {
  switch (status) {
    case 'PAID':
      return 'Plătită';
    case 'OVERDUE':
      return 'Restantă';
    case 'PENDING_CONFIRMATION':
      return 'În așteptare confirmare';
    case 'UNPAID':
    default:
      return 'Neplătită';
  }
}