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

export function escapeHtml(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeHtmlMultiline(value: any): string {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '#';
  const trimmed = url.trim();
  
  // Allow relative URLs starting with '/' (safe context paths)
  if (trimmed.startsWith('/')) {
    return escapeHtml(trimmed);
  }
  
  // Validate protocol
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return escapeHtml(trimmed);
    }
  } catch {
    // Fallback simple check
    if (/^https?:\/\//i.test(trimmed)) {
      return escapeHtml(trimmed);
    }
  }
  
  return '#unsafe-link';
}

