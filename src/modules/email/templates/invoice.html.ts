import { EmailTemplateResult, formatRoMoney } from './types';

export function buildInvoiceEmail(params: {
  companyName: string;
  invoiceNumber: string;
  total: number;
  dueDate?: string | null;
  paymentStatus: 'UNPAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  /** Personal message from the master (optional, plain text). */
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

  const escapedMessage = (params.customMessage ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `
      <p><strong>${params.companyName}</strong> v-a trimis ${docTitle} <strong>${params.invoiceNumber}</strong>.</p>
      <p>Total: <strong>${total} MDL</strong></p>
      ${!isPaid && params.dueDate ? `<p>Scadență: <strong>${params.dueDate}</strong></p>` : ''}
      ${params.customMessage?.trim() ? `<p>${escapedMessage.replace(/\n/g, '<br>')}</p>` : ''}
      <p style="color:#6b7280;font-size:13px;">PDF-ul este atașat la acest mesaj.</p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[INVOICE SENT] ${params.invoiceNumber}`,
  };
}
