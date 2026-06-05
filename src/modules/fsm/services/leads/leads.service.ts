import { Injectable } from '@nestjs/common';
import {
  CompanyLeadSource,
  CompanyLeadStatus,
  Prisma,
} from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { normalizePhone } from '../../../../common/utils/phone.util';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CompanyAuthorizationService } from '../../../companies/authorization/company-authorization.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { createEstimateProjectWithStages } from '../../../estimates/utils/project/create-estimate-project.util';
import { nextCompanyNumber } from '../../../../common/utils/sequence-number.util';
import { RLS_SYSTEM_CONTEXT } from '../../../../common/rls/rls-system.util';
import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprints';

const leadInclude = {
  customer: true,
  category: { select: { id: true, name: true, slug: true } },
  estimateProject: { select: { id: true, number: true, title: true, status: true } },
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

  private assertLeadOpen(status: CompanyLeadStatus) {
    if (status === 'CONVERTED' || status === 'LOST') {
      throw AppErrors.badRequest('Cererea este închisă.');
    }
  }

  listLeads(user: JwtPayload, status?: CompanyLeadStatus, cursor?: string, limit = 25) {
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.companyLead.findMany({
      where: {
        companyId: this.companyId(user),
        ...(status ? { status } : {}),
      },
      include: leadInclude,
      orderBy: { createdAt: 'desc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take,
    }).then((items) => {
      if (!cursor) {
        return items as any;
      }
      return {
        items,
        nextCursor: items.length === take ? items[items.length - 1]?.id : null,
      };
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
    this.assertLeadOpen(existing.status);

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

  async completeLead(user: JwtPayload, id: string) {
    const lead = await this.getLead(user, id);
    if (lead.status === 'CONVERTED') {
      throw AppErrors.badRequest('Cererea este deja finalizată.');
    }
    if (lead.status === 'LOST') {
      throw AppErrors.badRequest('Cererea este marcată pierdută.');
    }

    return this.prisma.companyLead.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        convertedAt: new Date(),
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
    this.assertLeadOpen(lead.status);

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
        return tx.companyLead.update({
          where: { id },
          data: {
            customerId,
            status: 'QUALIFIED',
          },
          include: leadInclude,
        });
      }

      if (mode === 'intervention') {
        await this.companyAuth.assertInterventionMonthlyLimit(cid);

        const number = await nextCompanyNumber(tx, {
          companyId: cid,
          namespace: 'intervention-number',
          prefix: 'INT',
          count: () => tx.intervention.count({ where: { companyId: cid } }),
          exists: async (n) =>
            this.prisma.runOutsideRlsContext(() =>
              this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) => {
                const intv = await db.intervention.findUnique({
                  where: { number: n },
                  select: { id: true },
                });
                return intv !== null;
              }),
            ),
        });

        const intervention = await tx.intervention.create({
          data: {
            companyId: cid,
            customerId,
            sourceLeadId: lead.id,
            number,
            type: lead.serviceTitle ?? lead.category?.name ?? 'Cerere nouă',
            description: lead.message ?? lead.serviceTitle ?? 'Convertit din cerere',
            address: lead.address ?? lead.contactName,
            scheduledAt: lead.scheduledAt ?? undefined,
            status: 'NEW',
            estimateProjectId: lead.estimateProjectId ?? undefined,
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

        const keepOpen =
          lead.source === 'PROJECT_REQUEST' ||
          lead.estimateProjectId != null ||
          lead.status === 'IN_PROGRESS';

        await tx.companyLead.update({
          where: { id },
          data: {
            customerId,
            status: keepOpen ? 'IN_PROGRESS' : 'CONVERTED',
            convertedAt: keepOpen ? undefined : new Date(),
          },
        });

        return { customerId, intervention, mode, keptOpen: keepOpen };
      }

      if (lead.estimateProjectId) {
        throw AppErrors.badRequest('Cererea are deja un calcul de preț asociat.');
      }

      const categoryId = body?.categoryId ?? lead.categoryId;
      if (!categoryId) {
        throw AppErrors.badRequest('Selectați categoria pentru calculul de preț.');
      }

      const [customer, category, blueprint, company] = await Promise.all([
        tx.companyCustomer.findFirst({ where: { id: customerId, companyId: cid } }),
        tx.category.findUnique({ where: { id: categoryId } }),
        tx.estimateBlueprint.findFirst({ where: { categoryId, isActive: true } }),
        tx.company.findUnique({ where: { id: cid }, select: { isTvaPayer: true } }),
      ]);
      if (!customer || !category) {
        throw AppErrors.badRequest('Client sau categorie invalidă.');
      }
      if (!blueprint) {
        throw AppErrors.badRequest('Nu există un calcul de preț pentru această categorie.');
      }

      const estNumber = await nextCompanyNumber(tx, {
        companyId: cid,
        namespace: 'estimate-number',
        prefix: 'EST',
        count: () => tx.estimateProject.count({ where: { companyId: cid } }),
        exists: async (n) =>
          this.prisma.runOutsideRlsContext(() =>
            this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) => {
              const project = await db.estimateProject.findUnique({
                where: { number: n },
                select: { id: true },
              });
              return project !== null;
            }),
          ),
      });

      const { id: projectId } = await createEstimateProjectWithStages(tx, {
        companyId: cid,
        customerId,
        categoryId,
        blueprintId: blueprint.id,
        config: blueprint.config as unknown as EstimateBlueprintConfig,
        number: estNumber,
        title: body?.title ?? lead.serviceTitle ?? `Calcul de preț ${category.name}`,
        address: lead.address ?? customer.address,
        isTvaPayer: company?.isTvaPayer ?? false,
      });

      await tx.companyLead.update({
        where: { id },
        data: {
          customerId,
          estimateProjectId: projectId,
          status: 'IN_PROGRESS',
        },
      });

      const project = await tx.estimateProject.findUniqueOrThrow({ where: { id: projectId } });
      return { customerId, project, mode, keptOpen: true };
    });
  }
}
