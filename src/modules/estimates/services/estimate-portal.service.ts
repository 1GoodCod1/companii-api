import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { EmailService } from '../../email/email.service';
import { EstimatePdfService } from '../../fsm/pdf/estimate-pdf.service';
import { portalEstimateInclude } from '../estimate.constants';
import {
  appendClientFeedback,
  type EstimateClientFeedbackKind,
} from '../utils/client-feedback.util';
import { EstimateProjectAccessService } from './estimate-project-access.service';

const TERMINAL_PORTAL_STATUSES: ReadonlySet<EstimateProjectStatus> = new Set([
  EstimateProjectStatus.ACCEPTED,
  EstimateProjectStatus.CANCELLED,
  EstimateProjectStatus.IN_EXECUTION,
  EstimateProjectStatus.DONE,
]);

@Injectable()
export class EstimatePortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EstimateProjectAccessService,
    private readonly email: EmailService,
    private readonly estimatePdf: EstimatePdfService,
  ) {}

  async updateStatus(
    customerId: string,
    projectId: string,
    status: 'ACCEPTED' | 'REJECTED',
  ) {
    return this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{ status: EstimateProjectStatus; clientFeedback: any; number: string; title: string; grandTotal: any }>>`
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

  async requestChanges(customerId: string, projectId: string, comment: string) {
    const trimmed = comment?.trim();
    if (!trimmed) {
      throw AppErrors.badRequest('Comentariul este obligatoriu');
    }
    if (trimmed.length > 2000) {
      throw AppErrors.badRequest('Comentariul depășește 2000 de caractere');
    }

    return this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{ status: EstimateProjectStatus; clientFeedback: any; number: string; title: string }>>`
        SELECT status, client_feedback as "clientFeedback", number, title FROM estimate_projects
        WHERE id = ${projectId} AND customer_id = ${customerId} FOR UPDATE
      `;
      const project = lockedProjects[0];
      if (!project) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

      if (TERMINAL_PORTAL_STATUSES.has(project.status)) {
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

  async getProject(customerId: string, projectId: string) {
    const project = await this.prisma.estimateProject.findFirst({
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

  async getProjectPdf(customerId: string, projectId: string, lang?: 'ro' | 'ru') {
    const project = await this.access.loadProjectForPdf(undefined, projectId, customerId);
    const buffer = await this.estimatePdf.build(project, { isClientView: true, locale: lang });
    return { buffer, filename: `${project.number}.pdf` };
  }
}
