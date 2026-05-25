import { Injectable } from '@nestjs/common';
import {
  CompanyLeadSource,
  CompanyLeadStatus,
  Prisma,
} from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { normalizePhone } from '../../common/utils/phone.util';
import { PrismaService } from '../shared/database/prisma.service';
import { CompanyAuthorizationService } from '../companies/company-authorization.service';
import type { JwtPayload } from '../auth/types/jwt-payload';

const leadInclude = {
  customer: true,
  category: { select: { id: true, name: true, slug: true } },
  booking: {
    include: {
      package: { select: { id: true, title: true, categoryId: true } },
    },
  },
} satisfies Prisma.CompanyLeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  private companyId(user: JwtPayload) {
    if (!user.activeCompanyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }
    return user.activeCompanyId;
  }

  listLeads(user: JwtPayload, status?: CompanyLeadStatus) {
    return this.prisma.companyLead.findMany({
      where: {
        companyId: this.companyId(user),
        ...(status ? { status } : {}),
      },
      include: leadInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLead(user: JwtPayload, id: string) {
    const lead = await this.prisma.companyLead.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: leadInclude,
    });
    if (!lead) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return lead;
  }

  createLead(
    user: JwtPayload,
    data: {
      contactName: string;
      contactPhone: string;
      contactEmail?: string;
      message?: string;
      address?: string;
      source?: CompanyLeadSource;
      categoryId?: string;
      scheduledAt?: string;
      notes?: string;
    },
  ) {
    const phone = normalizePhone(data.contactPhone) ?? data.contactPhone.trim();
    return this.prisma.companyLead.create({
      data: {
        companyId: this.companyId(user),
        contactName: data.contactName.trim(),
        contactPhone: phone,
        contactEmail: data.contactEmail?.trim().toLowerCase(),
        message: data.message?.trim(),
        address: data.address?.trim(),
        source: data.source ?? 'MANUAL',
        categoryId: data.categoryId,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        notes: data.notes?.trim(),
      },
      include: leadInclude,
    });
  }

  async createLeadFromBooking(
    bookingId: string,
    data: {
      companyId: string;
      contactName: string;
      contactPhone: string;
      contactEmail?: string;
      scheduledAt?: Date;
      categoryId?: string;
      packageTitle?: string;
      message?: string;
    },
  ) {
    const phone = normalizePhone(data.contactPhone) ?? data.contactPhone.trim();
    return this.prisma.companyLead.create({
      data: {
        companyId: data.companyId,
        bookingId,
        contactName: data.contactName.trim(),
        contactPhone: phone,
        contactEmail: data.contactEmail?.trim().toLowerCase(),
        scheduledAt: data.scheduledAt,
        categoryId: data.categoryId,
        packageTitle: data.packageTitle,
        message: data.message,
        source: 'PACKAGE_BOOKING',
        status: 'NEW',
      },
      include: leadInclude,
    });
  }

  async updateLead(
    user: JwtPayload,
    id: string,
    data: {
      status?: CompanyLeadStatus;
      notes?: string | null;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string | null;
      address?: string | null;
      scheduledAt?: string | null;
    },
  ) {
    const existing = await this.getLead(user, id);
    if (existing.status === 'CONVERTED') {
      throw AppErrors.badRequest('Lead-ul a fost deja convertit.');
    }

    return this.prisma.companyLead.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes === null ? null : data.notes?.trim(),
        contactName: data.contactName?.trim(),
        contactPhone: data.contactPhone
          ? normalizePhone(data.contactPhone) ?? data.contactPhone.trim()
          : undefined,
        contactEmail: data.contactEmail === null ? null : data.contactEmail?.trim().toLowerCase(),
        address: data.address === null ? null : data.address?.trim(),
        scheduledAt:
          data.scheduledAt === null
            ? null
            : data.scheduledAt
              ? new Date(data.scheduledAt)
              : undefined,
      },
      include: leadInclude,
    });
  }

  async convertLead(
    user: JwtPayload,
    id: string,
    mode: 'customer' | 'intervention' | 'estimate',
    body?: { categoryId?: string; title?: string },
  ) {
    const lead = await this.getLead(user, id);
    if (lead.status === 'CONVERTED') {
      throw AppErrors.badRequest('Lead-ul a fost deja convertit.');
    }

    const cid = this.companyId(user);

    return this.prisma.$transaction(async (tx) => {
      let customerId = lead.customerId;

      if (!customerId) {
        const customer = await tx.companyCustomer.create({
          data: {
            companyId: cid,
            fullName: lead.contactName,
            phone: lead.contactPhone,
            email: lead.contactEmail ?? undefined,
            address: lead.address ?? lead.contactName,
            notes: lead.notes ?? undefined,
          },
        });
        customerId = customer.id;
      }

      if (mode === 'customer') {
        await tx.companyLead.update({
          where: { id },
          data: {
            customerId,
            status: 'CONVERTED',
            convertedAt: new Date(),
          },
        });
        return { customerId, mode };
      }

      if (mode === 'intervention') {
        await this.companyAuth.assertInterventionMonthlyLimit(cid);

        const count = await tx.intervention.count({ where: { companyId: cid } });
        let number = `INT-${String(count + 1).padStart(5, '0')}`;
        for (let attempt = 0; attempt < 15; attempt++) {
          const exists = await tx.intervention.findUnique({ where: { number } });
          if (!exists) break;
          number = `INT-${String(count + 1 + attempt).padStart(5, '0')}`;
        }

        const intervention = await tx.intervention.create({
          data: {
            companyId: cid,
            customerId,
            sourceLeadId: lead.id,
            number,
            type: lead.packageTitle ?? lead.category?.name ?? 'Cerere nouă',
            description: lead.message ?? lead.packageTitle ?? 'Convertit din cerere',
            address: lead.address ?? lead.contactName,
            scheduledAt: lead.scheduledAt ?? undefined,
            status: 'NEW',
          },
        });

        if (user.memberId) {
          await tx.interventionStatusHistory.create({
            data: {
              interventionId: intervention.id,
              toStatus: 'NEW',
              changedByMemberId: user.memberId,
              note: 'Creat din cerere (lead)',
            },
          });
        }

        await tx.companyLead.update({
          where: { id },
          data: {
            customerId,
            status: 'CONVERTED',
            convertedAt: new Date(),
          },
        });

        return { customerId, intervention, mode };
      }

      const categoryId = body?.categoryId ?? lead.categoryId;
      if (!categoryId) {
        throw AppErrors.badRequest('Selectați categoria pentru smetă.');
      }

      const [customer, category, blueprint] = await Promise.all([
        tx.companyCustomer.findFirst({ where: { id: customerId, companyId: cid } }),
        tx.category.findUnique({ where: { id: categoryId } }),
        tx.estimateBlueprint.findFirst({
          where: { categoryId, isActive: true },
        }),
      ]);
      if (!customer || !category) {
        throw AppErrors.badRequest('Client sau categorie invalidă.');
      }

      const projectCount = await tx.estimateProject.count({ where: { companyId: cid } });
      let estNumber = `EST-${String(projectCount + 1).padStart(5, '0')}`;
      for (let attempt = 0; attempt < 15; attempt++) {
        const exists = await tx.estimateProject.findUnique({ where: { number: estNumber } });
        if (!exists) break;
        estNumber = `EST-${String(projectCount + 1 + attempt).padStart(5, '0')}`;
      }

      const config = blueprint?.config as { defaultStages?: unknown[] } | undefined;
      const project = await tx.estimateProject.create({
        data: {
          companyId: cid,
          customerId,
          categoryId,
          blueprintId: blueprint?.id,
          number: estNumber,
          title: body?.title ?? lead.packageTitle ?? `Smetă ${category.name}`,
          address: lead.address ?? customer.address,
          status: 'DRAFT',
        },
      });

      if (blueprint && config?.defaultStages) {
        const stages = config.defaultStages as Array<{
          code: string;
          name: string;
          kind?: string;
          description?: string;
          checklist?: string[];
        }>;
        for (let i = 0; i < stages.length; i++) {
          const stage = stages[i];
          await tx.estimateStage.create({
            data: {
              projectId: project.id,
              sortOrder: i,
              code: stage.code,
              name: stage.name,
              kind: (stage.kind as 'LABOR' | 'MATERIAL' | 'MIXED') ?? 'MIXED',
              description: stage.description,
              checklist: stage.checklist ?? [],
            },
          });
        }
      }

      await tx.companyLead.update({
        where: { id },
        data: {
          customerId,
          status: 'CONVERTED',
          convertedAt: new Date(),
        },
      });

      return { customerId, project, mode };
    });
  }
}
