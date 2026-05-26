import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompanyLeadSource } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../../common/rls/rls-system.util';
import { resolveClientContactFromUser } from '../../../common/utils/client-contact.util';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { LEAD_SOURCE_LABELS } from '../companies.constants';
import { ClientProjectRequestDto } from '../dto/client-project-request.dto';
import { ClientServiceRequestDto } from '../dto/client-service-request.dto';
import { createPublicCompanyLead } from '../utils/public-lead.util';

@Injectable()
export class CompaniesLeadsService {
  private readonly logger = new Logger(CompaniesLeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async requestPublicService(
    user: JwtPayload,
    companySlug: string,
    serviceId: string,
    body: ClientServiceRequestDto,
  ) {
    const contact = await resolveClientContactFromUser(
      this.prisma,
      user.sub,
      user.accountKind,
    );

    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
      const company = await this.prisma.company.findFirst({
        where: { slug: companySlug, isPublished: true, isVerified: true },
        select: { id: true, slug: true },
      });
      if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);

      const service = await this.prisma.companyService.findFirst({
        where: { id: serviceId, companyId: company.id, isPublished: true },
        include: { category: true },
      });
      if (!service) throw AppErrors.notFound(AppErrorMessages.SERVICE_NOT_FOUND);

      const result = await this.prisma.$transaction((tx) =>
        createPublicCompanyLead(
          tx,
          {
            companyId: company.id,
            contactName: contact.contactName,
            contactPhone: contact.contactPhone,
            contactEmail: contact.contactEmail,
            message: body.message?.trim() || `Cerere serviciu: ${service.name}`,
            scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
            categoryId: service.categoryId ?? undefined,
            serviceTitle: service.name,
            source: 'SERVICE_REQUEST',
          },
          { portalUserId: contact.portalUserId },
        ),
      );

      return {
        response: {
          leadId: result.lead.id,
          customerId: result.customerId,
          customerCreated: result.customerCreated,
          service: { id: service.id, name: service.name },
        },
        notification: {
          companyId: company.id,
          lead: {
            source: 'SERVICE_REQUEST' as const,
            contactName: result.lead.contactName,
            contactPhone: result.lead.contactPhone,
            contactEmail: result.lead.contactEmail,
            serviceTitle: result.lead.serviceTitle,
            message: result.lead.message,
            address: result.lead.address,
            customerCreated: result.customerCreated,
          },
        },
      };
    }).then(async ({ response, notification }) => {
      await this.safeNotifyManagersAboutPublicLead(notification.companyId, notification.lead);
      return response;
    });
  }

  async requestPublicProject(
    user: JwtPayload,
    companySlug: string,
    body: ClientProjectRequestDto,
  ) {
    const contact = await resolveClientContactFromUser(
      this.prisma,
      user.sub,
      user.accountKind,
    );

    return this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
      const company = await this.prisma.company.findFirst({
        where: { slug: companySlug, isPublished: true, isVerified: true },
        select: { id: true, categoryId: true },
      });
      if (!company) throw AppErrors.notFound(AppErrorMessages.COMPANY_NOT_FOUND);

      const categoryId = body.categoryId ?? company.categoryId ?? undefined;
      if (categoryId) {
        const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
        if (!category) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
      }

      const result = await this.prisma.$transaction((tx) =>
        createPublicCompanyLead(
          tx,
          {
            companyId: company.id,
            contactName: contact.contactName,
            contactPhone: contact.contactPhone,
            contactEmail: contact.contactEmail,
            message: body.message.trim(),
            address: body.address,
            categoryId,
            serviceTitle: body.projectTitle?.trim() || 'Cerere proiect',
            estimatedBudget: body.estimatedBudget,
            source: 'PROJECT_REQUEST',
          },
          { portalUserId: contact.portalUserId },
        ),
      );

      return {
        response: {
          leadId: result.lead.id,
          customerId: result.customerId,
          customerCreated: result.customerCreated,
        },
        notification: {
          companyId: company.id,
          lead: {
            source: 'PROJECT_REQUEST' as const,
            contactName: result.lead.contactName,
            contactPhone: result.lead.contactPhone,
            contactEmail: result.lead.contactEmail,
            serviceTitle: result.lead.serviceTitle,
            message: result.lead.message,
            address: result.lead.address,
            estimatedBudget: result.lead.estimatedBudget
              ? Number(result.lead.estimatedBudget)
              : null,
            customerCreated: result.customerCreated,
          },
        },
      };
    }).then(async ({ response, notification }) => {
      await this.safeNotifyManagersAboutPublicLead(notification.companyId, notification.lead);
      return response;
    });
  }

  private async safeNotifyManagersAboutPublicLead(
    companyId: string,
    lead: {
      source: CompanyLeadSource;
      contactName: string;
      contactPhone: string;
      contactEmail?: string | null;
      serviceTitle?: string | null;
      message?: string | null;
      address?: string | null;
      estimatedBudget?: number | null;
      customerCreated: boolean;
    },
  ) {
    try {
      await this.notifyManagersAboutPublicLead(companyId, lead);
    } catch (err) {
      this.logger.warn(`Lead notification failed for company ${companyId}`, err);
    }
  }

  private async notifyManagersAboutPublicLead(
    companyId: string,
    lead: {
      source: CompanyLeadSource;
      contactName: string;
      contactPhone: string;
      contactEmail?: string | null;
      serviceTitle?: string | null;
      message?: string | null;
      address?: string | null;
      estimatedBudget?: number | null;
      customerCreated: boolean;
    },
  ) {
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
