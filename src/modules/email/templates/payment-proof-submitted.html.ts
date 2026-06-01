import { EmailTemplateResult, formatRoMoney, escapeHtml } from './types';

export function buildPaymentProofSubmittedEmail(params: {
  companyName: string;
  invoiceNumber: string;
  clientName: string;
  total: number;
}): EmailTemplateResult {
  const total = formatRoMoney(params.total);
  const subject = `Dovadă plată primită — ${params.invoiceNumber} (${params.clientName})`;
  const text = [
    `Clientul ${params.clientName} a încărcat dovada plății pentru factura ${params.invoiceNumber}.`,
    `Total factură: ${total} MDL`,
    '',
    'Confirmați sau respingeți dovada din secțiunea Facturi a cabinetului companiei.',
  ].join('\n');

  const html = `
      <p>Clientul <strong>${escapeHtml(params.clientName)}</strong> a încărcat dovada plății pentru factura <strong>${escapeHtml(params.invoiceNumber)}</strong>.</p>
      <p>Total factură: <strong>${total} MDL</strong></p>
      <p>Confirmați sau respingeți dovada din secțiunea <strong>Facturi</strong> a cabinetului companiei.</p>
    `;

  return {
    subject,
    html,
    text,
    devLog: `[email:payment-proof-submitted] ${params.invoiceNumber}`,
  };
}
