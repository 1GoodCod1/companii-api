import { EmailTemplateResult, formatRoMoney, escapeHtml, escapeHtmlMultiline } from './types';

export function buildInvoiceEmail(params: {
  companyName: string;
  invoiceNumber: string;
  total: number;
  dueDate?: string | null;
  paymentStatus: 'UNPAID' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'PENDING_CONFIRMATION';
  customMessage?: string | null;
}): EmailTemplateResult {
  const total = formatRoMoney(params.total);
  const isPaid = params.paymentStatus === 'PAID';
  const docTitle = isPaid ? 'chitanța' : 'factura';
  const subject = isPaid
    ? `Chitanță ${params.invoiceNumber} — ${params.companyName}`
    : `Factură ${params.invoiceNumber} — ${params.companyName}`;

  const lines = [
    `${params.companyName} v-a trimis ${docTitle} ${params.invoiceNumber}.`,
    `Total: ${total} MDL`,
  ];
  if (!isPaid && params.dueDate) {
    lines.push(`Scadență: ${params.dueDate}`);
  }
  if (params.customMessage?.trim()) {
    lines.push('', params.customMessage.trim());
  }
  lines.push('', 'PDF-ul este atașat la acest mesaj.');
  const text = lines.join('\n');

  const html = `
      <p><strong>${escapeHtml(params.companyName)}</strong> v-a trimis ${docTitle} <strong>${escapeHtml(params.invoiceNumber)}</strong>.</p>
      <p>Total: <strong>${total} MDL</strong></p>
      ${!isPaid && params.dueDate ? `<p>Scadență: <strong>${escapeHtml(params.dueDate)}</strong></p>` : ''}
      ${params.customMessage?.trim() ? `<p>${escapeHtmlMultiline(params.customMessage)}</p>` : ''}
      <p style="color:#6b7280;font-size:13px;">PDF-ul este atașat la acest mesaj.</p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[INVOICE SENT] ${params.invoiceNumber}`,
  };
}
