import { EmailTemplateResult, formatRoMoney, escapeHtml, escapeHtmlMultiline, sanitizeUrl } from './types';

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
      <p><strong>${escapeHtml(params.companyName)}</strong> v-a trimis devizul <strong>${escapeHtml(params.quoteNumber)}</strong>.</p>
      <p>Total: <strong>${total} MDL</strong></p>
      <p><a href="${sanitizeUrl(params.portalUrl)}">Deschide portalul client</a></p>
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
  const subject = `Calcul de preț ${params.estimateNumber} — ${params.companyName}`;
  const text = [
    `${params.companyName} v-a trimis calculul de preț „${params.title}” (${params.estimateNumber}).`,
    `Total: ${total} MDL`,
    '',
    `Aprobați sau respingeți în portal: ${params.portalUrl}`,
  ].join('\n');
  const html = `
      <p><strong>${escapeHtml(params.companyName)}</strong> v-a trimis calculul de preț <strong>${escapeHtml(params.estimateNumber)}</strong>.</p>
      <p>${escapeHtml(params.title)}</p>
      <p>Total: <strong>${total} MDL</strong></p>
      <p><a href="${sanitizeUrl(params.portalUrl)}">Deschide portalul client</a></p>
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
  const subject = `Calcul de preț ${params.estimateNumber} ${action} — ${params.clientName}`;
  const text = [
    `Clientul ${params.clientName} a ${action} calculul de preț ${params.estimateNumber} (${params.title}).`,
    `Total: ${total} MDL`,
  ].join('\n');
  const html = `
      <p>Clientul <strong>${escapeHtml(params.clientName)}</strong> a <strong>${action}</strong> calculul de preț <strong>${escapeHtml(params.estimateNumber)}</strong>.</p>
      <p>${escapeHtml(params.title)}</p>
      <p>Total: <strong>${total} MDL</strong></p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[ESTIMATE ${params.status}] ${params.estimateNumber}`,
  };
}

export function buildEstimateFeedbackEmail(params: {
  estimateNumber: string;
  title: string;
  clientName: string;
  comment: string;
}): EmailTemplateResult {
  const subject = `Calcul de preț ${params.estimateNumber} — solicitare modificări de la ${params.clientName}`;
  const text = [
    `Clientul ${params.clientName} a solicitat modificări pentru calculul de preț ${params.estimateNumber} (${params.title}).`,
    '',
    'Comentariu client:',
    params.comment,
  ].join('\n');
  const html = `
      <p>Clientul <strong>${escapeHtml(params.clientName)}</strong> a solicitat modificări pentru calculul de preț <strong>${escapeHtml(params.estimateNumber)}</strong>.</p>
      <p>${escapeHtml(params.title)}</p>
      <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#444;">${escapeHtmlMultiline(params.comment)}</blockquote>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[ESTIMATE REQUEST_CHANGES] ${params.estimateNumber}`,
  };
}

export function buildCompletedInterventionPendingReceiptsEmail(params: {
  interventionNumber: string;
  projectName: string;
  pendingCount: number;
  pendingTotal: number;
}): EmailTemplateResult {
  const total = formatRoMoney(params.pendingTotal);
  const subject = `Atenție: Lucrare ${params.interventionNumber} finalizată cu achiziții pendinte`;
  const text = [
    `Lucrarea ${params.interventionNumber} a fost finalizată.`,
    `Proiect: ${params.projectName}`,
    `Există ${params.pendingCount} materiale fără chitanțe atașate, în valoare totală estimată de ${total} MDL.`,
    '',
    `Vă rugăm să solicitați chitanțele de la angajat sau să le marcați ca NO_RECEIPT / SKIPPED în aplicație.`,
  ].join('\n');
  const html = `
      <p>Lucrarea <strong>${escapeHtml(params.interventionNumber)}</strong> a fost finalizată.</p>
      <p>Proiect: <strong>${escapeHtml(params.projectName)}</strong></p>
      <p>Există <strong>${params.pendingCount} materiale</strong> fără chitanțe atașate, în valoare totală estimată de <strong>${total} MDL</strong>.</p>
      <p>Vă rugăm să solicitați chitanțele de la angajat sau să le marcați ca <strong>NO_RECEIPT / SKIPPED</strong> în aplicație.</p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[INTERVENTION COMPLETED PENDING RECEIPTS ALERT] ${params.interventionNumber}`,
  };
}

export function buildEstimateVarianceAlertEmail(params: {
  estimateNumber: string;
  projectName: string;
  variance: number;
  variancePct: number;
}): EmailTemplateResult {
  const variance = formatRoMoney(params.variance);
  const subject = `Atenție: Depășire buget materiale (+${params.variancePct}%) la calculul de preț ${params.estimateNumber}`;
  const text = [
    `Calculul de preț ${params.estimateNumber} („${params.projectName}”) a înregistrat o depășire a bugetului de materiale după blocarea prețurilor reale.`,
    `Deviație totală materiale: +${params.variancePct}% (+${variance} MDL)`,
    '',
    `Vă rugăm să analizați raportul de deviații în sistem pentru mai multe detalii.`,
  ].join('\n');
  const html = `
      <p>Calculul de preț <strong>${escapeHtml(params.estimateNumber)}</strong> („${escapeHtml(params.projectName)}”) a înregistrat o depășire a bugetului de materiale după blocarea prețurilor reale.</p>
      <p>Deviație totală materiale: <strong style="color: #ef4444;">+${params.variancePct}%</strong> (<strong>+${variance} MDL</strong>)</p>
      <p>Vă rugăm să analizați raportul de deviații în sistem pentru mai multe detalii.</p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[ESTIMATE VARIANCE ALERT] ${params.estimateNumber} (+${params.variancePct}%)`,
  };
}
