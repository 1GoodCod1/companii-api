import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EstimateProjectStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { findPortalCustomerForUser } from '../../common/utils/portal-customer.util';
import { findLeadsForEndClient } from '../../common/utils/client-leads.util';
import { PrismaService } from '../shared/database/prisma.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { REVIEWABLE_INTERVENTION_STATUSES } from '../reviews/reviews.types';
import { InvoicePdfService } from '../fsm/pdf/invoice-pdf.service';
import { EstimatePdfService } from '../fsm/pdf/estimate-pdf.service';
import { EmailService } from '../email/email.service';
import {
  appendClientFeedback,
  type EstimateClientFeedbackKind,
} from '../estimates/utils/client-feedback.util';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit-action.enum';
import { AuditEntityType } from '../audit/audit-entity-type.enum';

const TERMINAL_PORTAL_ESTIMATE_STATUSES: ReadonlySet<EstimateProjectStatus> = new Set([
  EstimateProjectStatus.ACCEPTED,
  EstimateProjectStatus.CANCELLED,
  EstimateProjectStatus.IN_EXECUTION,
  EstimateProjectStatus.DONE,
]);

const PORTAL_INVITE_TTL_MS = 2 * 60 * 60 * 1000;

const portalEstimateInclude = {
  customer: true,
  category: { select: { id: true, name: true, slug: true } },
  company: { select: { id: true, name: true, slug: true } },
  blueprint: { select: { id: true, config: true } },
  stages: {
    orderBy: { sortOrder: 'asc' as const },
    include: { lines: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly estimatePdf: EstimatePdfService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async dashboard(user: JwtPayload) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
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

    const interventionsWithReviewMeta = interventions.map((item) => ({
      ...item,
      canReview:
        !item.review &&
        REVIEWABLE_INTERVENTION_STATUSES.includes(item.status),
    }));

    return {
      customer,
      interventions: interventionsWithReviewMeta,
      quotes,
      invoices,
      reviews,
      estimates,
    };
  }

  async listMyLeads(user: JwtPayload, cursor?: string, limit = 25) {
    const take = Math.min(Math.max(limit, 1), 100);
    const leads = await findLeadsForEndClient(this.prisma, user.sub, take, cursor);
    const items = leads.map((lead) => ({
      id: lead.id,
      status: lead.status,
      source: lead.source,
      serviceTitle: lead.serviceTitle,
      message: lead.message,
      address: lead.address,
      estimatedBudget: lead.estimatedBudget ? Number(lead.estimatedBudget) : null,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      category: lead.category,
      company: lead.company,
    }));
    if (!cursor) {
      return items as any;
    }
    return {
      items,
      nextCursor: items.length === take ? items[items.length - 1]?.id : null,
    };
  }

  async updateEstimateStatus(user: JwtPayload, projectId: string, status: 'ACCEPTED' | 'REJECTED') {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    return this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{ status: EstimateProjectStatus; clientFeedback: any; number: string; title: string; grandTotal: any }>>`
        SELECT status, client_feedback as "clientFeedback", number, title, grand_total as "grandTotal"
        FROM estimate_projects 
        WHERE id = ${projectId} AND customer_id = ${customer.id} FOR UPDATE
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

      const kind: EstimateClientFeedbackKind = status === 'ACCEPTED' ? 'ACCEPT' : 'REJECT';
      const updated = await tx.estimateProject.update({
        where: { id: projectId },
        data: {
          status:
            status === 'ACCEPTED'
              ? EstimateProjectStatus.ACCEPTED
              : EstimateProjectStatus.CANCELLED,
          clientFeedback: appendClientFeedback(project.clientFeedback, { kind }),
        },
      });

      await this.audit.log({
        userId: user.sub,
        action:
          status === 'ACCEPTED'
            ? AuditAction.ESTIMATE_ACCEPTED
            : AuditAction.ESTIMATE_REJECTED,
        entityType: AuditEntityType.EstimateProject,
        entityId: projectId,
        newData: {
          number: fullProject.number,
          title: fullProject.title,
          grandTotal: Number(fullProject.grandTotal),
        },
      });

      const notifyEmail = fullProject.company.contactEmail ?? fullProject.company.owner.email;
      if (notifyEmail) {
        void this.email.sendEstimateStatusEmail({
          to: notifyEmail,
          companyName: fullProject.company.name,
          estimateNumber: fullProject.number,
          title: fullProject.title,
          clientName: fullProject.customer.fullName,
          status,
          total: Number(fullProject.grandTotal),
        });
      }

      return updated;
    });
  }

  async requestEstimateChanges(user: JwtPayload, projectId: string, comment: string) {
    const trimmed = comment?.trim();
    if (!trimmed) {
      throw AppErrors.badRequest('Comentariul este obligatoriu');
    }
    if (trimmed.length > 2000) {
      throw AppErrors.badRequest('Comentariul depășește 2000 de caractere');
    }

    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    return this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{ status: EstimateProjectStatus; clientFeedback: any; number: string; title: string }>>`
        SELECT status, client_feedback as "clientFeedback", number, title FROM estimate_projects
        WHERE id = ${projectId} AND customer_id = ${customer.id} FOR UPDATE
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
          clientFeedback: appendClientFeedback(project.clientFeedback, {
            kind: 'REQUEST_CHANGES',
            comment: trimmed,
          }),
        },
      });

      const notifyEmail = fullProject.company.contactEmail ?? fullProject.company.owner.email;
      if (notifyEmail) {
        void this.email.sendEstimateFeedbackEmail({
          to: notifyEmail,
          estimateNumber: fullProject.number,
          title: fullProject.title,
          clientName: fullProject.customer.fullName,
          comment: trimmed,
        });
      }

      return updated;
    });
  }

  async getEstimate(user: JwtPayload, projectId: string) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const project = await this.prisma.estimateProject.findFirst({
      where: {
        id: projectId,
        customerId: customer.id,
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
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return this.sanitizeEstimateForPortal(project);
  }

  private sanitizeEstimateForPortal(project: any) {
    if (!project) return null;
    
    // 1. Remove marginPct from project
    if ('marginPct' in project) {
      delete project.marginPct;
    }
    if ('laborRate' in project) {
      delete project.laborRate;
    }

    // 2. Process stages
    if (project.stages && Array.isArray(project.stages)) {
      project.stages = project.stages.map((stage) => {
        const sanitizedStage = { ...stage };
        delete sanitizedStage.laborRate;
        delete sanitizedStage.marginPct;
        delete sanitizedStage.laborCost;
        delete sanitizedStage.materialCost;
        
        // Process lines in stage
        if (sanitizedStage.lines && Array.isArray(sanitizedStage.lines)) {
          sanitizedStage.lines = sanitizedStage.lines.map((line) => {
            const sanitizedLine = { ...line };
            delete sanitizedLine.laborRate;
            delete sanitizedLine.marginPct;
            delete sanitizedLine.laborCost;
            delete sanitizedLine.materialCost;
            return sanitizedLine;
          });
        }
        return sanitizedStage;
      });
    }
    return project;
  }

  async getEstimatePdf(user: JwtPayload, projectId: string) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const project = await this.prisma.estimateProject.findFirst({
      where: { id: projectId, customerId: customer.id },
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
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const buffer = await this.estimatePdf.build(project, { isClientView: true });
    return { buffer, filename: `${project.number}.pdf` };
  }

  async updateQuoteStatus(user: JwtPayload, quoteId: string, status: 'ACCEPTED' | 'REJECTED') {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, customerId: customer.id, status: 'SENT' },
    });
    if (!quote) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.quote.update({
      where: { id: quoteId },
      data: { status },
    });
  }

  async getInvoicePdf(user: JwtPayload, invoiceId: string) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: {
        id: invoiceId,
        intervention: { customerId: customer.id },
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
    if (!invoice) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const buffer = await this.invoicePdf.build(invoice);
    return {
      buffer,
      filename: `${invoice.number}.pdf`,
    };
  }

  async createInvite(customerId: string) {
    const token = `pi_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + PORTAL_INVITE_TTL_MS);

    return this.prisma.$transaction(async (tx) => {
      await tx.portalInvitation.updateMany({
        where: {
          customerId,
          status: 'PENDING',
        },
        data: {
          status: 'EXPIRED',
        },
      });

      return tx.portalInvitation.create({
        data: {
          customerId,
          token,
          expiresAt,
        },
        include: {
          customer: {
            select: {
              fullName: true,
              phone: true,
              email: true,
              company: { select: { name: true } },
            },
          },
        },
      });
    });
  }
}
