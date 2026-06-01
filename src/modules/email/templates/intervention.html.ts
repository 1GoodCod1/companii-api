import { EmailTemplateResult, escapeHtml, sanitizeUrl } from './types';

export function buildInterventionAssignedEmail(params: {
  technicianName?: string | null;
  companyName: string;
  interventionNumber: string;
  type: string;
  address: string;
  customerName?: string | null;
  scheduledAt?: string | null;
  interventionUrl: string;
}): EmailTemplateResult {
  const greeting = params.technicianName?.trim()
    ? `Salut, ${params.technicianName.trim()}!`
    : 'Salut!';
  const subject = `Lucrare nouă atribuită — ${params.interventionNumber} · ${params.type}`;

  const lines = [
    greeting,
    '',
    `Ți-a fost atribuită o lucrare nouă la compania ${params.companyName}.`,
    '',
    `Nr. lucrare: ${params.interventionNumber}`,
    `Tip: ${params.type}`,
    params.customerName ? `Client: ${params.customerName}` : null,
    `Adresă: ${params.address}`,
    params.scheduledAt ? `Programată: ${params.scheduledAt}` : null,
    '',
    `Deschide lucrarea: ${params.interventionUrl}`,
  ].filter((line): line is string => line !== null);

  const htmlParts = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>Ți-a fost atribuită o lucrare nouă la compania <strong>${escapeHtml(params.companyName)}</strong>.</p>`,
    '<ul>',
    `<li><strong>Nr. lucrare:</strong> ${escapeHtml(params.interventionNumber)}</li>`,
    `<li><strong>Tip:</strong> ${escapeHtml(params.type)}</li>`,
    params.customerName ? `<li><strong>Client:</strong> ${escapeHtml(params.customerName)}</li>` : '',
    `<li><strong>Adresă:</strong> ${escapeHtml(params.address)}</li>`,
    params.scheduledAt ? `<li><strong>Programată:</strong> ${escapeHtml(params.scheduledAt)}</li>` : '',
    '</ul>',
    `<p><a href="${sanitizeUrl(params.interventionUrl)}">Deschide lucrarea</a></p>`,
  ].filter(Boolean);

  return {
    subject,
    text: lines.join('\n'),
    html: htmlParts.join('\n'),
    devLog: `[INTERVENTION ASSIGNED] ${params.interventionNumber} → ${params.technicianName ?? 'angajat'}`,
  };
}
