export interface EmailTemplateResult {
  subject: string;
  text: string;
  html: string;
  devLog: string;
}

export const ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Manager',
  MEMBER: 'Angajat',
};

export function formatRoMoney(amount: number): string {
  return amount.toLocaleString('ro-MD', { minimumFractionDigits: 2 });
}

export function formatRoDateTime(date: Date): string {
  return date.toLocaleString('ro-MD', { dateStyle: 'short', timeStyle: 'short' });
}
