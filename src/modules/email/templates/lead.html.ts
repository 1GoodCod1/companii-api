import { EmailTemplateResult, escapeHtml, escapeHtmlMultiline, sanitizeUrl } from './types';

export function buildNewLeadEmail(params: {
  companyName: string;
  sourceLabel: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string | null;
  serviceTitle?: string | null;
  message?: string | null;
  address?: string | null;
  estimatedBudget?: number | null;
  customerCreated: boolean;
  leadsUrl: string;
}): EmailTemplateResult {
  const title = params.serviceTitle?.trim() || params.sourceLabel;
  const subject = `Cerere nouă — ${title} · ${params.contactName}`;
  const budgetLabel =
    params.estimatedBudget != null && params.estimatedBudget > 0
      ? `${params.estimatedBudget.toLocaleString('ro-MD')} MDL`
      : null;
  const lines = [
    `Ați primit o cerere nouă pe pagina publică a companiei ${params.companyName}.`,
    '',
    `Tip: ${params.sourceLabel}`,
    title !== params.sourceLabel ? `Titlu: ${title}` : null,
    `Client: ${params.contactName}`,
    `Telefon: ${params.contactPhone}`,
    params.contactEmail ? `Email: ${params.contactEmail}` : null,
    params.address ? `Adresă: ${params.address}` : null,
    budgetLabel ? `Buget estimativ: ${budgetLabel}` : null,
    params.message ? `Mesaj: ${params.message}` : null,
    params.customerCreated
      ? 'Client nou creat automat în CRM.'
      : 'Client existent asociat cererii.',
    '',
    `Deschide cererile: ${params.leadsUrl}`,
  ].filter((line): line is string => Boolean(line));

  const htmlParts = [
    `<p>Ați primit o cerere nouă pe pagina publică a companiei <strong>${escapeHtml(params.companyName)}</strong>.</p>`,
    '<ul>',
    `<li><strong>Tip:</strong> ${escapeHtml(params.sourceLabel)}</li>`,
    title !== params.sourceLabel ? `<li><strong>Titlu:</strong> ${escapeHtml(title)}</li>` : '',
    `<li><strong>Client:</strong> ${escapeHtml(params.contactName)}</li>`,
    `<li><strong>Telefon:</strong> ${escapeHtml(params.contactPhone)}</li>`,
    params.contactEmail ? `<li><strong>Email:</strong> ${escapeHtml(params.contactEmail)}</li>` : '',
    params.address ? `<li><strong>Adresă:</strong> ${escapeHtml(params.address)}</li>` : '',
    budgetLabel ? `<li><strong>Buget estimativ:</strong> ${escapeHtml(budgetLabel)}</li>` : '',
    params.message ? `<li><strong>Mesaj:</strong> ${escapeHtmlMultiline(params.message)}</li>` : '',
    `<li>${params.customerCreated ? 'Client nou creat automat în CRM.' : 'Client existent asociat cererii.'}</li>`,
    '</ul>',
    `<p><a href="${sanitizeUrl(params.leadsUrl)}">Deschide inbox cereri</a></p>`,
  ].filter(Boolean);

  return {
    subject,
    text: lines.join('\n'),
    html: htmlParts.join('\n'),
    devLog: `[NEW LEAD] ${params.contactName} — ${title}`,
  };
}
