import { Injectable } from '@nestjs/common';
import {
  CompanyLeadSource,
  CompanyLeadStatus,
  EstimateProjectStatus,
  QuoteStatus,
  Prisma,
} from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { normalizePhone } from '../../../../common/utils/phone.util';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CompanyAuthorizationService } from '../../../companies/authorization/company-authorization.service';
import { CacheService } from '../../../shared/cache/cache.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { createEstimateProjectWithStages } from '../../../estimates/utils/project/create-estimate-project.util';
import { nextCompanyNumber } from '../../../../common/utils/sequence-number.util';
import { toCursorPage } from '../../../../common/utils/cursor-page.util';
import { RLS_SYSTEM_CONTEXT } from '../../../../common/rls/rls-system.util';
import { assertLeadTransition, isClosedLeadStatus } from '../../utils/status-transitions';
import type { EstimateBlueprintConfig } from '../../../../../prisma/estimate-blueprints';

const leadInclude = {
  customer: true,
  category: { select: { id: true, name: true, slug: true } },
  estimateProject: { select: { id: true, number: true, title: true, status: true } },
  interventions: { select: { id: true, number: true, type: true } },
} satisfies Prisma.CompanyLeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAuth: CompanyAuthorizationService,
    private readonly cache: CacheService,
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
    }).then((items) => toCursorPage(items, take));
  }

  async getLead(user: JwtPayload, id: string) {
    const lead = await this.prisma.companyLead.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: leadInclude,
    });
    if (!lead) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return lead;
  }

  async createLead(
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
    const result = await this.prisma.companyLead.create({
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

    await this.cache.invalidateAnalytics(this.companyId(user));

    return result;
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

    if (data.status === 'CONVERTED') {
      throw AppErrors.badRequest('Folosiți acțiunea de finalizare sau conversie a cererii.');
    }

    if (data.status) {
      try {
        assertLeadTransition(existing.status, data.status);
      } catch (err) {
        if (err instanceof Error) {
          throw AppErrors.badRequest(
            `Tranziția ${existing.status} → ${data.status} nu este permisă.`,
          );
        }
        throw err;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyLead.update({
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

      if (data.status === 'LOST' && existing.estimateProjectId) {
        await tx.estimateProject.update({
          where: { id: existing.estimateProjectId },
          data: { status: EstimateProjectStatus.CANCELLED },
        });
        const project = await tx.estimateProject.findUnique({
          where: { id: existing.estimateProjectId },
          select: { quoteId: true },
        });
        if (project?.quoteId) {
          await tx.quote.update({
            where: { id: project.quoteId },
            data: { status: QuoteStatus.REJECTED },
          });
        }
      }

      return updated;
    });

    await this.cache.invalidateAnalytics(this.companyId(user));

    return result;
  }

  async completeLead(user: JwtPayload, id: string) {
    const lead = await this.getLead(user, id);
    if (lead.status === 'CONVERTED') {
      throw AppErrors.badRequest('Cererea este deja finalizată.');
    }
    if (lead.status === 'LOST') {
      throw AppErrors.badRequest('Cererea este marcată pierdută.');
    }

    try {
      assertLeadTransition(lead.status, 'CONVERTED', { allowConverted: true });
    } catch (err) {
      if (err instanceof Error) {
        throw AppErrors.badRequest(
          `Tranziția ${lead.status} → CONVERTED nu este permisă.`,
        );
      }
      throw err;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyLead.update({
        where: { id },
        data: {
          status: 'CONVERTED',
          convertedAt: new Date(),
        },
        include: leadInclude,
      });

      // Sync linked interventions: complete any open ones
      const openInterventions = await tx.intervention.findMany({
        where: {
          sourceLeadId: id,
          status: { notIn: ['COMPLETED', 'CANCELLED', 'INVOICED', 'PAID'] },
        },
        select: { id: true, status: true, number: true },
      });

      for (const intv of openInterventions) {
        await tx.intervention.update({
          where: { id: intv.id },
          data: { status: 'COMPLETED' },
        });
        if (user.memberId) {
          await tx.interventionStatusHistory.create({
            data: {
              interventionId: intv.id,
              fromStatus: intv.status,
              toStatus: 'COMPLETED',
              changedByMemberId: user.memberId,
              note: 'Finalizat automat la conversia cererii.',
            },
          });
        }
      }

      return { updated, completedInterventions: openInterventions };
    });

    await this.cache.invalidateAnalytics(this.companyId(user));

    return result.updated;
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

    const result = await this.prisma.$transaction(async (tx) => {
      let customerId = lead.customerId;

      if (!customerId) {
        const customer = await tx.companyCustomer.create({
          data: {
            companyId: cid,
            fullName: lead.contactName,
            phone: lead.contactPhone,
            email: lead.contactEmail ?? undefined,
            address: lead.address ?? '',
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
        const existingIntervention = await tx.intervention.findFirst({
          where: {
            companyId: cid,
            sourceLeadId: lead.id,
          },
          select: { id: true },
        });
        if (existingIntervention) {
          throw AppErrors.badRequest('O lucrare a fost deja creată pentru această cerere.');
        }

        await this.companyAuth.assertInterventionMonthlyLimit(cid);

        const number = await nextCompanyNumber(tx, {
          companyId: cid,
          namespace: 'intervention-number',
          prefix: 'INT',
          count: (year) =>
            tx.intervention.count({
              where: {
                companyId: cid,
                createdAt: {
                  gte: new Date(year, 0, 1),
                  lt: new Date(year + 1, 0, 1),
                },
              },
            }),
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

        let estimatedPrice = lead.estimatedBudget ?? undefined;
        if (estimatedPrice === undefined && lead.serviceTitle) {
          const service = await tx.companyService.findFirst({
            where: { companyId: cid, name: lead.serviceTitle },
            select: { defaultPrice: true },
          });
          if (service && Number(service.defaultPrice) > 0) {
            estimatedPrice = service.defaultPrice;
          }
        }

        const intervention = await tx.intervention.create({
          data: {
            companyId: cid,
            customerId,
            sourceLeadId: lead.id,
            number,
            type: lead.serviceTitle ?? lead.category?.name ?? 'Cerere nouă',
            description: lead.message ?? lead.serviceTitle ?? 'Convertit din cerere',
            address: lead.address ?? '',
            scheduledAt: lead.scheduledAt ?? undefined,
            status: 'NEW',
            estimatedPrice,
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
          lead.estimateProjectId != null;

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
        count: (year) =>
          tx.estimateProject.count({
            where: {
              companyId: cid,
              createdAt: {
                gte: new Date(year, 0, 1),
                lt: new Date(year + 1, 0, 1),
              },
            },
          }),
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

    await this.cache.invalidateAnalytics(cid);

    return result;
  }
}
