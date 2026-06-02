import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import { EstimateProjectStatus, Prisma, QuoteStatus } from '@prisma/client';
import type { CompanyCustomer, Quote, EstimateProject } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '@/common/errors';
import { findLeadsForEndClient } from '@/common/utils/client-leads.util';
import { resolveInterventionDescriptions } from '@/modules/fsm/utils/resolve-intervention-descriptions.util';
import { REVIEWABLE_INTERVENTION_STATUSES } from '@/modules/reviews/reviews.types';
import type {
  PortalRepository,
  PortalDashboardData,
  PortalEstimateActionResult,
  PortalEstimateChangesResult,
  PortalLead,
  FeedbackAppendFn,
} from '../../domain/ports/portal.repository.port';

const TERMINAL_PORTAL_ESTIMATE_STATUSES: ReadonlySet<EstimateProjectStatus> = new Set([
  EstimateProjectStatus.ACCEPTED,
  EstimateProjectStatus.CANCELLED,
  EstimateProjectStatus.IN_EXECUTION,
  EstimateProjectStatus.DONE,
]);

const portalEstimateInclude = {
  customer: true,
  category: { select: { id: true, name: true, slug: true } },
  company: { select: { id: true, name: true, slug: true } },
  blueprint: { select: { id: true, config: true } },
  measurements: { orderBy: { key: 'asc' as const } },
  stages: {
    orderBy: { sortOrder: 'asc' as const },
    include: { lines: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

@Injectable()
export class PrismaPortalRepository implements PortalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCustomerByUserId(userId: string): Promise<CompanyCustomer> {
    const customer = await this.prisma.companyCustomer.findFirst({
      where: { portalUserId: userId },
    });
    if (!customer) throw AppErrors.notFound(AppErrorMessages.PORTAL_NOT_LINKED);
    return customer;
  }

  listMyLeads(userId: string, take: number, cursor?: string): Promise<PortalLead[]> {
    return findLeadsForEndClient(this.prisma, userId, take, cursor);
  }

  findQuoteByIdAndCustomer(quoteId: string, customerId: string): Promise<Quote | null> {
    return this.prisma.quote.findFirst({
      where: { id: quoteId, customerId, status: 'SENT' },
    });
  }

  updateQuoteStatus(quoteId: string, status: QuoteStatus): Promise<Quote> {
    return this.prisma.quote.update({
      where: { id: quoteId },
      data: { status },
    });
  }

  findProjectByIdAndCustomer(projectId: string, customerId: string): Promise<EstimateProject | null> {
    return this.prisma.estimateProject.findFirst({
      where: {
        id: projectId,
        customerId,
        status: {
          in: [
            EstimateProjectStatus.SENT,
            EstimateProjectStatus.ACCEPTED,
            EstimateProjectStatus.IN_EXECUTION,
            EstimateProjectStatus.DONE,
            EstimateProjectStatus.CANCELLED,
          ],
        },
      },
      include: portalEstimateInclude,
    });
  }

  async getDashboardData(customer: CompanyCustomer): Promise<PortalDashboardData> {
    const [interventions, quotes, invoices, reviews, estimates] = await this.prisma.inSerial([
      () =>
        this.prisma.intervention.findMany({
          where: { customerId: customer.id },
          orderBy: { updatedAt: 'desc' },
          take: 20,
          include: {
            company: {
              select: { id: true, name: true, slug: true },
            },
            review: {
              select: {
                id: true,
                rating: true,
                comment: true,
                createdAt: true,
              },
            },
          },
        }),
      () =>
        this.prisma.quote.findMany({
          where: { customerId: customer.id, status: { in: ['SENT', 'ACCEPTED', 'CONVERTED'] } },
          orderBy: { createdAt: 'desc' },
        }),
      () =>
        this.prisma.companyInvoice.findMany({
          where: { intervention: { customerId: customer.id } },
          orderBy: { issuedAt: 'desc' },
        }),
      () =>
        this.prisma.companyReview.findMany({
          where: { customerId: customer.id },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            rating: true,
            comment: true,
            clientName: true,
            createdAt: true,
            companyId: true,
            interventionId: true,
            intervention: {
              select: { id: true, number: true, type: true },
            },
          },
        }),
      () =>
        this.prisma.estimateProject.findMany({
          where: {
            customerId: customer.id,
            status: { in: ['SENT', 'ACCEPTED', 'IN_EXECUTION', 'DONE'] },
          },
          orderBy: { updatedAt: 'desc' },
          include: {
            category: { select: { id: true, name: true } },
            company: { select: { id: true, name: true, slug: true } },
          },
        }),
    ]);

    const interventionsWithReviewMeta = (await resolveInterventionDescriptions(
      this.prisma,
      interventions,
      'client',
    )).map((item) => ({
      ...item,
      canReview:
        !item.review &&
        REVIEWABLE_INTERVENTION_STATUSES.includes(item.status),
    }));

    return {
      interventions: interventionsWithReviewMeta,
      quotes,
      invoices,
      reviews,
      estimates,
    };
  }

  async acceptOrRejectEstimate(
    customerId: string,
    projectId: string,
    status: 'ACCEPTED' | 'REJECTED',
    appendFeedbackFn: FeedbackAppendFn,
  ): Promise<PortalEstimateActionResult> {
    return await this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{
        status: EstimateProjectStatus;
        clientFeedback: Prisma.JsonValue;
        number: string;
        title: string;
        grandTotal: Prisma.Decimal | null;
      }>>`
        SELECT status, client_feedback as "clientFeedback", number, title, grand_total as "grandTotal"
        FROM estimate_projects 
        WHERE id = ${projectId} AND customer_id = ${customerId} FOR UPDATE
      `;
      const project = lockedProjects[0];
      if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
      if (project.status !== EstimateProjectStatus.SENT) {
        throw AppErrors.conflict('Smeta a fost deja procesată.');
      }

      const fullProject = await tx.estimateProject.findUniqueOrThrow({
        where: { id: projectId },
        include: {
          customer: { select: { fullName: true } },
          company: {
            select: {
              name: true,
              contactEmail: true,
              owner: { select: { email: true } },
            },
          },
        },
      });

      const updated = await tx.estimateProject.update({
        where: { id: projectId },
        data: {
          status:
            status === 'ACCEPTED'
              ? EstimateProjectStatus.ACCEPTED
              : EstimateProjectStatus.CANCELLED,
          clientFeedback: appendFeedbackFn(project.clientFeedback),
        },
      });

      return { updatedProject: updated, fullProject };
    });
  }

  async requestEstimateChanges(
    customerId: string,
    projectId: string,
    comment: string,
    appendFeedbackFn: FeedbackAppendFn,
  ): Promise<PortalEstimateChangesResult> {
    return await this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{
        status: EstimateProjectStatus;
        clientFeedback: Prisma.JsonValue;
        number: string;
        title: string;
      }>>`
        SELECT status, client_feedback as "clientFeedback", number, title FROM estimate_projects
        WHERE id = ${projectId} AND customer_id = ${customerId} FOR UPDATE
      `;
      const project = lockedProjects[0];
      if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

      if (TERMINAL_PORTAL_ESTIMATE_STATUSES.has(project.status)) {
        throw AppErrors.badRequest(AppErrorMessages.STATUS_LOCKED);
      }
      if (project.status !== EstimateProjectStatus.SENT) {
        throw AppErrors.badRequest('Smeta nu este trimisă spre revizuire');
      }

      const fullProject = await tx.estimateProject.findUniqueOrThrow({
        where: { id: projectId },
        include: {
          customer: { select: { fullName: true } },
          company: {
            select: {
              name: true,
              contactEmail: true,
              owner: { select: { email: true } },
            },
          },
        },
      });

      const updated = await tx.estimateProject.update({
        where: { id: projectId },
        data: {
          status: EstimateProjectStatus.CALCULATED,
          clientFeedback: appendFeedbackFn(project.clientFeedback),
        },
      });

      if (fullProject.quoteId) {
        await tx.quote.update({
          where: { id: fullProject.quoteId },
          data: { status: QuoteStatus.DRAFT },
        });
      }

      return { updatedProject: updated, fullProject, quoteId: fullProject.quoteId };
    });
  }

  getInvoicePdfData(invoiceId: string, customerId: string) {
    return this.prisma.companyInvoice.findFirst({
      where: {
        id: invoiceId,
        intervention: { customerId },
      },
      include: {
        company: {
          select: {
            name: true,
            legalName: true,
            idno: true,
            legalAddress: true,
            contactPhone: true,
            contactEmail: true,
            isTvaPayer: true,
            tvaCode: true,
          },
        },
        intervention: { include: { customer: true } },
      },
    });
  }

  getEstimatePdfData(projectId: string, customerId: string) {
    return this.prisma.estimateProject.findFirst({
      where: { id: projectId, customerId },
      include: {
        company: {
          select: {
            name: true,
            legalName: true,
            idno: true,
            legalAddress: true,
            contactPhone: true,
            contactEmail: true,
            isTvaPayer: true,
            tvaCode: true,
          },
        },
        customer: true,
        category: { select: { name: true } },
        stages: {
          orderBy: { sortOrder: 'asc' },
          include: { lines: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  getInvoiceDetails(invoiceId: string) {
    return this.prisma.companyInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: {
        intervention: { include: { customer: { select: { fullName: true } } } },
        company: {
          select: {
            name: true,
            contactEmail: true,
            owner: { select: { email: true } },
          },
        },
      },
    });
  }

  async checkProjectOwnership(projectId: string, customerId: string): Promise<void> {
    const project = await this.prisma.estimateProject.findUniqueOrThrow({
      where: { id: projectId },
      select: { customerId: true },
    });
    if (project.customerId !== customerId) {
      throw AppErrors.forbidden('');
    }
  }
}
