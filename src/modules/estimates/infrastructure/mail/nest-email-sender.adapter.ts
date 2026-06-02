import { EmailService } from '../../../email/email.service';
import type { EmailSender } from '../../domain/ports/email-sender.port';

export class NestEmailSender implements EmailSender {
  constructor(private readonly email: EmailService) {}

  async sendEstimateEmail(params: { to: string; companyName: string; estimateNumber: string; title: string; total: number; portalUrl: string }): Promise<void> {
    await this.email.sendEstimateEmail(params);
  }

  async sendEstimateStatusEmail(params: { to: string; companyName: string; estimateNumber: string; title: string; clientName: string; status: string; total: number }): Promise<void> {
    await this.email.sendEstimateStatusEmail({
      ...params,
      status: params.status as 'ACCEPTED' | 'REJECTED',
    });
  }

  async sendEstimateVarianceAlertEmail(params: { to: string; estimateNumber: string; projectName: string; variance: number; variancePct: number }): Promise<void> {
    await this.email.sendEstimateVarianceAlertEmail(params);
  }

  async sendEstimateFeedbackEmail(params: { to: string; estimateNumber: string; title: string; clientName: string; comment: string }): Promise<void> {
    await this.email.sendEstimateFeedbackEmail(params);
  }
}