import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { RLS_SYSTEM_CONTEXT } from '../../../common/rls/rls-system.util';
import { resolveClientContactFromUser } from '../../../common/utils/client-contact.util';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { ClientProjectRequestDto } from '@/modules/companies/dto/client-project-request.dto';
import { createPublicCompanyLead } from '../utils/public-lead.util';
import { LeadNotificationService } from '../services/lead-notification.service';

@Injectable()
export class RequestPublicProjectUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadNotifier: LeadNotificationService,
  ) {}

  async execute(user: JwtPayload, companySlug: string, body: ClientProjectRequestDto) {
    const contact = await resolveClientContactFromUser(
      this.prisma,
      user.sub,
      user.accountKind,
    );

    return this.prisma.runOutsideRlsContext(() =>
      this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async () => {
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
    })).then(async ({ response, notification }) => {
      await this.leadNotifier.safeNotifyManagersAboutPublicLead(
        notification.companyId,
        notification.lead,
      );
      return response;
    });
  }
}
