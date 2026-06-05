import { EmailTemplateResult, sanitizeUrl } from './types';

export function buildPasswordResetEmail(params: {
  resetUrl: string;
}): EmailTemplateResult {
  const subject = `Resetare parolă — Faber`;
  const text = [
    'Ați solicitat resetarea parolei pentru contul dvs. Faber Companii.',
    '',
    `Resetați parola accesând următorul link: ${params.resetUrl}`,
    '',
    'Dacă nu ați solicitat această resetare, vă rugăm să ignorați acest email. Linkul este valabil timp de o oră.',
  ].join('\n');
  const html = `
      <p>Ați solicitat resetarea parolei pentru contul dvs. <strong>Faber Companii</strong>.</p>
      <p><a href="${sanitizeUrl(params.resetUrl)}" style="background-color:#4f46e5;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Resetați Parola</a></p>
      <p style="color:#666;font-size:12px;margin-top:20px;">Dacă nu ați solicitat această resetare, vă rugăm să ignorați acest email. Linkul este valabil timp de o oră.</p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[PASSWORD RESET requested]`,
  };
}

export function buildEmailVerificationEmail(params: {
  verifyUrl: string;
  name?: string;
}): EmailTemplateResult {
  const greeting = params.name ? `Bună, ${params.name}!` : 'Bună!';
  const subject = `Confirmați adresa de email — Faber Companii`;
  const text = [
    greeting,
    '',
    'Vă mulțumim pentru înregistrare la Faber.',
    `Confirmați adresa de email accesând următorul link: ${params.verifyUrl}`,
    '',
    'Dacă nu v-ați creat un cont, ignorați acest email. Linkul este valabil 24 de ore.',
  ].join('\n');
  const html = `
      <p>${greeting}</p>
      <p>Vă mulțumim pentru înregistrare la <strong>Faber Companii</strong>. Confirmați adresa de email pentru a vă activa complet contul.</p>
      <p><a href="${sanitizeUrl(params.verifyUrl)}" style="background-color:#4f46e5;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Confirmați Emailul</a></p>
      <p style="color:#666;font-size:12px;margin-top:20px;">Dacă nu v-ați creat un cont, ignorați acest email. Linkul este valabil 24 de ore.</p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[EMAIL VERIFICATION requested]`,
  };
}
