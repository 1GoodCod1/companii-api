import { EmailTemplateResult } from './types';

export function buildPasswordResetEmail(params: {
  resetUrl: string;
}): EmailTemplateResult {
  const subject = `Resetare parolă — Faber Companii`;
  const text = [
    'Ați solicitat resetarea parolei pentru contul dvs. Faber Companii.',
    '',
    `Resetați parola accesând următorul link: ${params.resetUrl}`,
    '',
    'Dacă nu ați solicitat această resetare, vă rugăm să ignorați acest email. Linkul este valabil timp de o oră.',
  ].join('\n');
  const html = `
      <p>Ați solicitat resetarea parolei pentru contul dvs. <strong>Faber Companii</strong>.</p>
      <p><a href="${params.resetUrl}" style="background-color:#4f46e5;color:#ffffff;padding:10px 18px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Resetați Parola</a></p>
      <p style="color:#666;font-size:12px;margin-top:20px;">Dacă nu ați solicitat această resetare, vă rugăm să ignorați acest email. Linkul este valabil timp de o oră.</p>
    `;

  return {
    subject,
    text,
    html,
    devLog: `[PASSWORD RESET requested]`,
  };
}
