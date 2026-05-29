import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanyLeadSource } from '@prisma/client';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { LEAD_SOURCE_LABELS } from '../companies.constants';

export interface PublicLeadNotification {
  source: CompanyLeadSource;
  contactName: string;
  contactPhone: string;
  contactEmail?: string | null;
  serviceTitle?: string | null;
  message?: string | null;
  address?: string | null;
  estimatedBudget?: number | null;
  customerCreated: boolean;
}

@Injectable()
export class LeadNotificationService {
  private readonly logger = new Logger(LeadNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async safeNotifyManagersAboutPublicLead(
    companyId: string,
    lead: PublicLeadNotification,
  ): Promise<void> {
    try {
      await this.notifyManagersAboutPublicLead(companyId, lead);
    } catch (err) {
      this.logger.warn(`Lead notification failed for company ${companyId}`, err);
    }
  }

  private async notifyManagersAboutPublicLead(
    companyId: string,
    lead: PublicLeadNotification,
  ): Promise<void> {
    const company = await this.prisma.runOutsideRlsContext(() =>
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          name: true,
          contactEmail: true,
          owner: { select: { email: true } },
          members: {
            where: { status: 'ACTIVE', role: { in: ['OWNER', 'MANAGER'] } },
            select: { user: { select: { email: true } } },
          },
        },
      }),
    );
    if (!company) return;

    const recipients = [
      company.owner.email,
      company.contactEmail,
      ...company.members.map((member) => member.user.email),
    ].filter((email): email is string => Boolean(email));
    const uniqueRecipients = [...new Set(recipients)];
    if (!uniqueRecipients.length) return;

    const frontendUrl = this.config.get<string>('frontendUrl') || 'http://localhost:5174';
    const leadsUrl = `${frontendUrl}/company/cereri`;
    const sourceLabel = LEAD_SOURCE_LABELS[lead.source] ?? lead.source;

    for (const to of uniqueRecipients) {
      await this.email.sendNewLeadEmail({
        to,
        companyName: company.name,
        sourceLabel,
        contactName: lead.contactName,
        contactPhone: lead.contactPhone,
        contactEmail: lead.contactEmail,
        serviceTitle: lead.serviceTitle,
        message: lead.message,
        address: lead.address,
        estimatedBudget: lead.estimatedBudget,
        customerCreated: lead.customerCreated,
        leadsUrl,
      });
    }
  }
}
