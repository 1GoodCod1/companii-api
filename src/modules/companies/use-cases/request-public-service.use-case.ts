import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../../common/rls/rls-system.util';
import { resolveClientContactFromUser } from '../../../common/utils/client-contact.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { ClientServiceRequestDto } from '@/modules/companies/dto/client-service-request.dto';
import { createPublicCompanyLead } from '../utils/public-lead.util';
import { LeadNotificationService } from '../services/lead-notification.service';

@Injectable()
export class RequestPublicServiceUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadNotifier: LeadNotificationService,
  ) {}

  async execute(
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
      await this.leadNotifier.safeNotifyManagersAboutPublicLead(
        notification.companyId,
        notification.lead,
      );
      return response;
    });
  }
}
