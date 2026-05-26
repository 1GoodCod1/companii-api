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

const PORTAL_INVITE_TTL_MS = 2 * 60 * 60 * 1000;

const portalEstimateInclude = {
  customer: true,
  category: { select: { id: true, name: true, slug: true } },
  company: { select: { id: true, name: true, slug: true } },
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

  async listMyLeads(user: JwtPayload) {
    const leads = await findLeadsForEndClient(this.prisma, user.sub);
    return leads.map((lead) => ({
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
  }

  async updateEstimateStatus(user: JwtPayload, projectId: string, status: 'ACCEPTED' | 'REJECTED') {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const project = await this.prisma.estimateProject.findFirst({
      where: { id: projectId, customerId: customer.id, status: EstimateProjectStatus.SENT },
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
    if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const updated = await this.prisma.estimateProject.update({
      where: { id: projectId },
      data: {
        status:
          status === 'ACCEPTED'
            ? EstimateProjectStatus.ACCEPTED
            : EstimateProjectStatus.CANCELLED,
      },
    });

    const notifyEmail = project.company.contactEmail ?? project.company.owner.email;
    if (notifyEmail) {
      void this.email.sendEstimateStatusEmail({
        to: notifyEmail,
        companyName: project.company.name,
        estimateNumber: project.number,
        title: project.title,
        clientName: project.customer.fullName,
        status,
        total: Number(project.grandTotal),
      });
    }

    return updated;
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

    const buffer = await this.estimatePdf.build(project);
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
