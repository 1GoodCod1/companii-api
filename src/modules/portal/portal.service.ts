import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { findPortalCustomerForUser } from '../../common/utils/portal-customer.util';
import { findLeadsForEndClient } from '../../common/utils/client-leads.util';
import { PrismaService } from '../shared/database/prisma.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { EstimateCommentService } from '../estimates/services/history/estimate-comment.service';
import { GetPortalDashboardUseCase } from './use-cases/get-portal-dashboard.use-case';
import { AcceptOrRejectEstimateUseCase } from './use-cases/accept-or-reject-estimate.use-case';
import { RequestEstimateChangesUseCase } from './use-cases/request-estimate-changes.use-case';
import { CreatePortalInvitationUseCase } from './use-cases/create-portal-invitation.use-case';
import { GetPortalEstimateUseCase } from './use-cases/get-portal-estimate.use-case';
import { GetPortalEstimatePdfUseCase } from './use-cases/get-portal-estimate-pdf.use-case';
import { GetPortalInvoicePdfUseCase } from './use-cases/get-portal-invoice-pdf.use-case';
import { SubmitInvoicePaymentProofUseCase } from './use-cases/submit-invoice-payment-proof.use-case';

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comments: EstimateCommentService,
    private readonly getPortalDashboard: GetPortalDashboardUseCase,
    private readonly acceptOrRejectEstimate: AcceptOrRejectEstimateUseCase,
    private readonly requestEstimateChangesUseCase: RequestEstimateChangesUseCase,
    private readonly createPortalInvitation: CreatePortalInvitationUseCase,
    private readonly getPortalEstimate: GetPortalEstimateUseCase,
    private readonly getPortalEstimatePdf: GetPortalEstimatePdfUseCase,
    private readonly getPortalInvoicePdf: GetPortalInvoicePdfUseCase,
    private readonly submitInvoicePaymentProofUseCase: SubmitInvoicePaymentProofUseCase,
  ) {}

  async dashboard(user: JwtPayload) {
    return this.getPortalDashboard.execute(user);
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
    return this.acceptOrRejectEstimate.execute(user, projectId, status);
  }

  async requestEstimateChanges(user: JwtPayload, projectId: string, comment: string) {
    return this.requestEstimateChangesUseCase.execute(user, projectId, comment);
  }

  async getEstimate(user: JwtPayload, projectId: string) {
    return this.getPortalEstimate.execute(user, projectId);
  }

  async getEstimatePdf(user: JwtPayload, projectId: string, lang?: 'ro' | 'ru') {
    return this.getPortalEstimatePdf.execute(user, projectId, lang);
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
    return this.getPortalInvoicePdf.execute(user, invoiceId);
  }

  async submitInvoicePaymentProof(user: JwtPayload, invoiceId: string, fileId: string) {
    return this.submitInvoicePaymentProofUseCase.execute(user, invoiceId, fileId);
  }

  async createInvite(customerId: string) {
    return this.createPortalInvitation.execute(customerId);
  }

  async listEstimateComments(user: JwtPayload, projectId: string) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const project = await this.prisma.estimateProject.findUniqueOrThrow({
      where: { id: projectId },
      select: { customerId: true },
    });
    if (project.customerId !== customer.id) {
      throw AppErrors.forbidden('');
    }
    return this.comments.listComments(projectId);
  }

  async addEstimateComment(user: JwtPayload, projectId: string, body: string) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const project = await this.prisma.estimateProject.findUniqueOrThrow({
      where: { id: projectId },
      select: { customerId: true },
    });
    if (project.customerId !== customer.id) {
      throw AppErrors.forbidden('');
    }
    return this.comments.addComment(projectId, user.sub, 'CLIENT', body);
  }
}
