import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const ROLE_LABELS: Record<string, string> = {
  MANAGER: 'Manager',
  MEMBER: 'Tehnician',
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const smtp = this.config.get<{
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
    }>('email.smtp');
    const enabled = this.config.get<boolean>('email.enabled');

    if (enabled && smtp?.host && smtp.user && smtp.pass) {
      this.transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      this.logger.log(`Email SMTP ready (${smtp.host}:${smtp.port})`);
    } else {
      this.logger.warn('Email disabled or SMTP incomplete — messages will be logged only');
    }
  }

  async sendTeamInviteEmail(params: {
    to: string;
    companyName: string;
    role: string;
    inviteUrl: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const roleLabel = ROLE_LABELS[params.role] ?? params.role;
    const expires = params.expiresAt.toLocaleString('ro-MD', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
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

    return this.send(params.to, subject, html, text, `[TEAM INVITE] ${params.to}: ${params.inviteUrl}`);
  }

  async sendTeamMemberDeactivatedEmail(params: {
    to: string;
    companyName: string;
    actorName?: string;
  }): Promise<boolean> {
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

    return this.send(params.to, subject, html, text, `[TEAM DEACTIVATED] ${params.to}`);
  }

  async sendTeamMemberLeftEmail(params: {
    to: string;
    companyName: string;
    memberName: string;
  }): Promise<boolean> {
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

    return this.send(params.to, subject, html, text, `[TEAM LEFT] ${params.to}: ${params.memberName}`);
  }

  async sendOwnershipTransferredEmail(params: {
    to: string;
    companyName: string;
    previousOwnerName: string;
    newOwnerName: string;
    isNewOwner: boolean;
  }): Promise<boolean> {
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

    return this.send(params.to, subject, html, text, `[OWNERSHIP TRANSFER] ${params.to}`);
  }

  async sendQuoteEmail(params: {
    to: string;
    companyName: string;
    quoteNumber: string;
    total: number;
    portalUrl: string;
  }): Promise<boolean> {
    const total = params.total.toLocaleString('ro-MD', { minimumFractionDigits: 2 });
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
    return this.send(params.to, subject, html, text, `[QUOTE SENT] ${params.to}: ${params.quoteNumber}`);
  }

  async sendEstimateEmail(params: {
    to: string;
    companyName: string;
    estimateNumber: string;
    title: string;
    total: number;
    portalUrl: string;
  }): Promise<boolean> {
    const total = params.total.toLocaleString('ro-MD', { minimumFractionDigits: 2 });
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
    return this.send(params.to, subject, html, text, `[ESTIMATE SENT] ${params.to}: ${params.estimateNumber}`);
  }

  async sendEstimateStatusEmail(params: {
    to: string;
    companyName: string;
    estimateNumber: string;
    title: string;
    clientName: string;
    status: 'ACCEPTED' | 'REJECTED';
    total: number;
  }): Promise<boolean> {
    const total = params.total.toLocaleString('ro-MD', { minimumFractionDigits: 2 });
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
    return this.send(params.to, subject, html, text, `[ESTIMATE ${params.status}] ${params.to}: ${params.estimateNumber}`);
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    text: string,
    devLog?: string,
  ): Promise<boolean> {
    const from = this.config.get<string>('email.from') || 'noreply@faber.md';

    if (this.transporter) {
      try {
        await this.transporter.sendMail({ from, to, subject, html, text });
        this.logger.log(`Email sent to ${to}: "${subject}"`);
        return true;
      } catch (err) {
        this.logger.error(`Failed to send email to ${to}`, err);
        return false;
      }
    }

    if (this.config.get<string>('nodeEnv') === 'development' && devLog) {
      this.logger.warn(devLog);
    }
    return false;
  }
}
