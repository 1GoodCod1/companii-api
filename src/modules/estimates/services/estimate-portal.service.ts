import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { EmailService } from '../../email/email.service';
import { EstimatePdfService } from '../../fsm/pdf/estimate-pdf.service';
import { portalEstimateInclude } from '../estimate.constants';
import { EstimateProjectAccessService } from './estimate-project-access.service';

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
    const project = await this.prisma.estimateProject.findFirst({
      where: { id: projectId, customerId, status: EstimateProjectStatus.SENT },
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
    return project;
  }

  async getProjectPdf(customerId: string, projectId: string) {
    const project = await this.access.loadProjectForPdf(undefined, projectId, customerId);
    const buffer = await this.estimatePdf.build(project);
    return { buffer, filename: `${project.number}.pdf` };
  }
}
