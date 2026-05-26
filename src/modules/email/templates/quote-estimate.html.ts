import { EmailTemplateResult, formatRoMoney } from './types';

export function buildQuoteEmail(params: {
  companyName: string;
  quoteNumber: string;
  total: number;
  portalUrl: string;
}): EmailTemplateResult {
  const total = formatRoMoney(params.total);
  const subject = `Deviz ${params.quoteNumber} — ${params.companyName}`;
  const text = [
    `${params.companyName} v-a trimis devizul ${params.quoteNumber}.`,
    `Total: ${total} MDL`,
    '',
    `Vizualizați și răspundeți în portal: ${params.portalUrl}`,
  ].join('\n');
  const html = `
      <p><strong>${params.companyName}</strong> v-a trimis devizul <strong>${params.quoteNumber}</strong>.</p>
      <p>Total: <strong>${total} MDL</strong></p>
      <p><a href="${params.portalUrl}">Deschide portalul client</a></p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[QUOTE SENT] ${params.quoteNumber}`,
  };
}

export function buildEstimateEmail(params: {
  companyName: string;
  estimateNumber: string;
  title: string;
  total: number;
  portalUrl: string;
}): EmailTemplateResult {
  const total = formatRoMoney(params.total);
  const subject = `Smetă ${params.estimateNumber} — ${params.companyName}`;
  const text = [
    `${params.companyName} v-a trimis smeta „${params.title}” (${params.estimateNumber}).`,
    `Total: ${total} MDL`,
    '',
    `Aprobați sau respingeți în portal: ${params.portalUrl}`,
  ].join('\n');
  const html = `
      <p><strong>${params.companyName}</strong> v-a trimis smeta <strong>${params.estimateNumber}</strong>.</p>
      <p>${params.title}</p>
      <p>Total: <strong>${total} MDL</strong></p>
      <p><a href="${params.portalUrl}">Deschide portalul client</a></p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[ESTIMATE SENT] ${params.estimateNumber}`,
  };
}

export function buildEstimateStatusEmail(params: {
  companyName: string;
  estimateNumber: string;
  title: string;
  clientName: string;
  status: 'ACCEPTED' | 'REJECTED';
  total: number;
}): EmailTemplateResult {
  const total = formatRoMoney(params.total);
  const action = params.status === 'ACCEPTED' ? 'acceptat' : 'respins';
  const subject = `Smetă ${params.estimateNumber} ${action} — ${params.clientName}`;
  const text = [
    `Clientul ${params.clientName} a ${action} smeta ${params.estimateNumber} (${params.title}).`,
    `Total: ${total} MDL`,
  ].join('\n');
  const html = `
      <p>Clientul <strong>${params.clientName}</strong> a <strong>${action}</strong> smeta <strong>${params.estimateNumber}</strong>.</p>
      <p>${params.title}</p>
      <p>Total: <strong>${total} MDL</strong></p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[ESTIMATE ${params.status}] ${params.estimateNumber}`,
  };
}
