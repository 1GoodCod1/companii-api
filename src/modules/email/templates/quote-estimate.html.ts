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

export function buildEstimateFeedbackEmail(params: {
  estimateNumber: string;
  title: string;
  clientName: string;
  comment: string;
}): EmailTemplateResult {
  const subject = `Smetă ${params.estimateNumber} — solicitare modificări de la ${params.clientName}`;
  const text = [
    `Clientul ${params.clientName} a solicitat modificări pentru smeta ${params.estimateNumber} (${params.title}).`,
    '',
    'Comentariu client:',
    params.comment,
  ].join('\n');
  const safeComment = params.comment
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />');
  const html = `
      <p>Clientul <strong>${params.clientName}</strong> a solicitat modificări pentru smeta <strong>${params.estimateNumber}</strong>.</p>
      <p>${params.title}</p>
      <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#444;">${safeComment}</blockquote>
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
    `Vă rugăm să solicitați chitanțele de la tehnician sau să le marcați ca NO_RECEIPT / SKIPPED în aplicație.`,
  ].join('\n');
  const html = `
      <p>Lucrarea <strong>${params.interventionNumber}</strong> a fost finalizată.</p>
      <p>Proiect: <strong>${params.projectName}</strong></p>
      <p>Există <strong>${params.pendingCount} materiale</strong> fără chitanțe atașate, în valoare totală estimată de <strong>${total} MDL</strong>.</p>
      <p>Vă rugăm să solicitați chitanțele de la tehnician sau să le marcați ca <strong>NO_RECEIPT / SKIPPED</strong> în aplicație.</p>
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
  const subject = `Atenție: Depășire buget materiale (+${params.variancePct}%) la smeta ${params.estimateNumber}`;
  const text = [
    `Smeta ${params.estimateNumber} („${params.projectName}”) a înregistrat o depășire a bugetului de materiale după blocarea prețurilor reale.`,
    `Deviație totală materiale: +${params.variancePct}% (+${variance} MDL)`,
    '',
    `Vă rugăm să analizați raportul de deviații în sistem pentru mai multe detalii.`,
  ].join('\n');
  const html = `
      <p>Smeta <strong>${params.estimateNumber}</strong> („${params.projectName}”) a înregistrat o depășire a bugetului de materiale după blocarea prețurilor reale.</p>
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
