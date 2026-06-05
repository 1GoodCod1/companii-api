import { Inject, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { EstimateCommentService } from '../estimates/services/history/estimate-comment.service';
import { GetPortalDashboardUseCase } from './use-cases/get-portal-dashboard.use-case';
import { AcceptOrRejectEstimateUseCase } from './use-cases/accept-or-reject-estimate.use-case';
import { RequestEstimateChangesUseCase } from './use-cases/request-estimate-changes.use-case';
import { CreatePortalInvitationUseCase } from '../portal-invitation/create-portal-invitation.use-case';
import { GetPortalEstimateUseCase } from './use-cases/get-portal-estimate.use-case';
import { GetPortalEstimatePdfUseCase } from './use-cases/get-portal-estimate-pdf.use-case';
import { GetPortalInvoicePdfUseCase } from './use-cases/get-portal-invoice-pdf.use-case';
import { SubmitInvoicePaymentProofUseCase } from './use-cases/submit-invoice-payment-proof.use-case';
import { PORTAL_REPOSITORY } from './domain/ports/portal.repository.port';
import type { PrismaPortalRepository } from './infrastructure/persistence/prisma-portal.repository';

@Injectable()
export class PortalService {
  constructor(
    @Inject(PORTAL_REPOSITORY)
    private readonly portalRepo: PrismaPortalRepository,
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
    return await this.getPortalDashboard.execute(user);
  }

  async listMyLeads(user: JwtPayload, cursor?: string, limit = 25) {
    const take = Math.min(Math.max(limit, 1), 100);
    const leads = await this.portalRepo.listMyLeads(user.sub, take, cursor);
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
    return await this.acceptOrRejectEstimate.execute(user, projectId, status);
  }

  async requestEstimateChanges(user: JwtPayload, projectId: string, comment: string) {
    return await this.requestEstimateChangesUseCase.execute(user, projectId, comment);
  }

  async getEstimate(user: JwtPayload, projectId: string) {
    return await this.getPortalEstimate.execute(user, projectId);
  }

  async getEstimatePdf(user: JwtPayload, projectId: string, lang?: 'ro' | 'ru') {
    return await this.getPortalEstimatePdf.execute(user, projectId, lang);
  }

  async updateQuoteStatus(user: JwtPayload, quoteId: string, status: 'ACCEPTED' | 'REJECTED') {
    return this.portalRepo.acceptOrRejectQuote(user.sub, quoteId, status);
  }

  async getInvoicePdf(user: JwtPayload, invoiceId: string) {
    return await this.getPortalInvoicePdf.execute(user, invoiceId);
  }

  async submitInvoicePaymentProof(user: JwtPayload, invoiceId: string, fileId: string) {
    return await this.submitInvoicePaymentProofUseCase.execute(user, invoiceId, fileId);
  }

  async createInvite(companyId: string, customerId: string) {
    return await this.createPortalInvitation.execute(companyId, customerId);
  }

  async listEstimateComments(user: JwtPayload, projectId: string) {
    await this.portalRepo.checkProjectOwnership(projectId, user.sub);
    return this.comments.listComments(projectId);
  }

  async addEstimateComment(user: JwtPayload, projectId: string, body: string) {
    await this.portalRepo.checkProjectOwnership(projectId, user.sub);
    return this.comments.addComment(projectId, user.sub, 'CLIENT', body);
  }
}
