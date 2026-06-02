import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  buildEstimateEmail,
  buildEstimateFeedbackEmail,
  buildEstimateStatusEmail,
  buildInvoiceEmail,
  buildNewLeadEmail,
  buildOwnershipTransferredEmail,
  buildPasswordResetEmail,
  buildQuoteEmail,
  buildTeamInviteEmail,
  buildTeamMemberDeactivatedEmail,
  buildTeamMemberLeftEmail,
  buildCompletedInterventionPendingReceiptsEmail,
  buildEstimateVarianceAlertEmail,
  buildInterventionAssignedEmail,
  buildPaymentProofSubmittedEmail,
} from './templates';

@Injectable()
export class EmailService implements OnModuleInit {
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
        pool: true,
        maxConnections: 3,
        maxMessages: 100,
      });
      this.logger.log(`Email SMTP ready (${smtp.host}:${smtp.port})`);
    } else {
      this.logger.warn('Email disabled or SMTP incomplete — messages will be logged only');
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified');
    } catch (err) {
      this.logger.error(
        `SMTP verify failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async sendTeamInviteEmail(params: {
    to: string;
    companyName: string;
    role: string;
    inviteUrl: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const tpl = buildTeamInviteEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendTeamMemberDeactivatedEmail(params: {
    to: string;
    companyName: string;
    actorName?: string;
  }): Promise<boolean> {
    const tpl = buildTeamMemberDeactivatedEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendTeamMemberLeftEmail(params: {
    to: string;
    companyName: string;
    memberName: string;
  }): Promise<boolean> {
    const tpl = buildTeamMemberLeftEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendOwnershipTransferredEmail(params: {
    to: string;
    companyName: string;
    previousOwnerName: string;
    newOwnerName: string;
    isNewOwner: boolean;
  }): Promise<boolean> {
    const tpl = buildOwnershipTransferredEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendQuoteEmail(params: {
    to: string;
    companyName: string;
    quoteNumber: string;
    total: number;
    portalUrl: string;
  }): Promise<boolean> {
    const tpl = buildQuoteEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendEstimateEmail(params: {
    to: string;
    companyName: string;
    estimateNumber: string;
    title: string;
    total: number;
    portalUrl: string;
  }): Promise<boolean> {
    const tpl = buildEstimateEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendNewLeadEmail(params: {
    to: string;
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
  }): Promise<boolean> {
    const tpl = buildNewLeadEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendInterventionAssignedEmail(params: {
    to: string;
    technicianName?: string | null;
    companyName: string;
    interventionNumber: string;
    type: string;
    address: string;
    customerName?: string | null;
    scheduledAt?: string | null;
    interventionUrl: string;
  }): Promise<boolean> {
    const tpl = buildInterventionAssignedEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
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
    const tpl = buildEstimateStatusEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendEstimateFeedbackEmail(params: {
    to: string;
    estimateNumber: string;
    title: string;
    clientName: string;
    comment: string;
  }): Promise<boolean> {
    const tpl = buildEstimateFeedbackEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendPasswordResetEmail(params: {
    to: string;
    resetUrl: string;
  }): Promise<boolean> {
    const tpl = buildPasswordResetEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendCompletedInterventionPendingReceiptsEmail(params: {
    to: string;
    interventionNumber: string;
    projectName: string;
    pendingCount: number;
    pendingTotal: number;
  }): Promise<boolean> {
    const tpl = buildCompletedInterventionPendingReceiptsEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendInvoiceEmail(params: {
    to: string;
    companyName: string;
    invoiceNumber: string;
    total: number;
    dueDate?: string | null;
    paymentStatus: 'UNPAID' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'PENDING_CONFIRMATION';
    customMessage?: string | null;
    pdfBuffer?: Buffer;
  }): Promise<boolean> {
    const tpl = buildInvoiceEmail({
      companyName: params.companyName,
      invoiceNumber: params.invoiceNumber,
      total: params.total,
      dueDate: params.dueDate,
      paymentStatus: params.paymentStatus,
      customMessage: params.customMessage,
    });
    return await this.send(
      params.to,
      tpl.subject,
      tpl.html,
      tpl.text,
      `${tpl.devLog} → ${params.to}`,
      params.pdfBuffer
        ? [{ filename: `${params.invoiceNumber}.pdf`, content: params.pdfBuffer, contentType: 'application/pdf' }]
        : undefined,
    );
  }

  async sendPaymentProofSubmittedEmail(params: {
    to: string;
    companyName: string;
    invoiceNumber: string;
    clientName: string;
    total: number;
  }): Promise<boolean> {
    const tpl = buildPaymentProofSubmittedEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  async sendEstimateVarianceAlertEmail(params: {
    to: string;
    estimateNumber: string;
    projectName: string;
    variance: number;
    variancePct: number;
  }): Promise<boolean> {
    const tpl = buildEstimateVarianceAlertEmail(params);
    return await this.send(params.to, tpl.subject, tpl.html, tpl.text, `${tpl.devLog} → ${params.to}`);
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    text: string,
    devLog?: string,
    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>,
  ): Promise<boolean> {
    const from = this.config.get<string>('email.from') || 'noreply@faber.md';

    if (this.transporter) {
      try {
        await this.transporter.sendMail({ from, to, subject, html, text, attachments });
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
