import {
  EmailTemplateResult,
  ROLE_LABELS,
  formatRoDateTime,
} from './types';

export function buildTeamInviteEmail(params: {
  companyName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}): EmailTemplateResult {
  const roleLabel = ROLE_LABELS[params.role] ?? params.role;
  const expires = formatRoDateTime(params.expiresAt);
  const subject = `Invitație în echipa ${params.companyName}`;
  const text = [
    `Ai fost invitat(ă) în echipa ${params.companyName} ca ${roleLabel}.`,
    '',
    `Acceptă invitația: ${params.inviteUrl}`,
    '',
    `Linkul expiră la ${expires}.`,
  ].join('\n');
  const html = `
      <p>Ai fost invitat(ă) în echipa <strong>${params.companyName}</strong> ca <strong>${roleLabel}</strong>.</p>
      <p><a href="${params.inviteUrl}">Acceptă invitația</a></p>
      <p style="color:#666;font-size:12px;">Linkul expiră la ${expires}.</p>
    `;

  return { subject, text, html, devLog: `[TEAM INVITE] invite: ${params.inviteUrl}` };
}

export function buildTeamMemberDeactivatedEmail(params: {
  companyName: string;
  actorName?: string;
}): EmailTemplateResult {
  const subject = `Acces retras — ${params.companyName}`;
  const actor = params.actorName ? ` de ${params.actorName}` : '';
  const text = [
    `Accesul dvs. la compania ${params.companyName} a fost retras${actor}.`,
    '',
    'Lucrările active vi-au fost dezasignate. Contactați proprietarul companiei dacă credeți că este o eroare.',
  ].join('\n');
  const html = `
      <p>Accesul dvs. la compania <strong>${params.companyName}</strong> a fost retras${actor}.</p>
      <p>Lucrările active vi-au fost dezasignate. Contactați proprietarul companiei dacă credeți că este o eroare.</p>
    `;

  return { subject, text, html, devLog: `[TEAM DEACTIVATED] ${params.companyName}` };
}

export function buildTeamMemberLeftEmail(params: {
  companyName: string;
  memberName: string;
}): EmailTemplateResult {
  const subject = `${params.memberName} a părăsit echipa ${params.companyName}`;
  const text = [
    `${params.memberName} a părăsit echipa companiei ${params.companyName}.`,
    '',
    'Lucrările active ale acestui tehnician au fost dezasignate.',
  ].join('\n');
  const html = `
      <p><strong>${params.memberName}</strong> a părăsit echipa companiei <strong>${params.companyName}</strong>.</p>
      <p>Lucrările active ale acestui tehnician au fost dezasignate.</p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[TEAM LEFT] ${params.memberName} — ${params.companyName}`,
  };
}

export function buildOwnershipTransferredEmail(params: {
  companyName: string;
  previousOwnerName: string;
  newOwnerName: string;
  isNewOwner: boolean;
}): EmailTemplateResult {
  const subject = params.isNewOwner
    ? `Sunteți noul proprietar — ${params.companyName}`
    : `Proprietate transferată — ${params.companyName}`;
  const text = params.isNewOwner
    ? [
        `Sunteți acum proprietarul companiei ${params.companyName}.`,
        `Proprietarul anterior: ${params.previousOwnerName}.`,
      ].join('\n')
    : [
        `Ați transferat proprietatea companiei ${params.companyName} către ${params.newOwnerName}.`,
        'Rolul dvs. în echipă este acum Manager.',
      ].join('\n');
  const html = params.isNewOwner
    ? `
        <p>Sunteți acum proprietarul companiei <strong>${params.companyName}</strong>.</p>
        <p>Proprietarul anterior: <strong>${params.previousOwnerName}</strong>.</p>
      `
    : `
        <p>Ați transferat proprietatea companiei <strong>${params.companyName}</strong> către <strong>${params.newOwnerName}</strong>.</p>
        <p>Rolul dvs. în echipă este acum <strong>Manager</strong>.</p>
      `;

  return { subject, text, html, devLog: `[OWNERSHIP TRANSFER] ${params.companyName}` };
}
