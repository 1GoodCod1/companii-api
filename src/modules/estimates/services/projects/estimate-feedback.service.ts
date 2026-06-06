import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import { EmailService } from '@/modules/email/email.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { CreateEstimateFeedbackDto } from '../../dto/estimate-feedback.dto';

@Injectable()
export class EstimateFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async createFeedback(user: JwtPayload, dto: CreateEstimateFeedbackDto) {
    const userId = user.sub;
    const companyId = user.activeCompanyId;
    const projectId = dto.projectId;

    // Resolve project details if projectId was supplied
    let projectNumberAndTitle = '';
    if (projectId) {
      const project = await this.prisma.estimateProject.findUnique({
        where: { id: projectId },
        select: { number: true, title: true },
      });
      if (project) {
        projectNumberAndTitle = `${project.number} - ${project.title}`;
      }
    }

    // Save to the database
    const feedback = await this.prisma.estimateFeedback.create({
      data: {
        userId,
        companyId: companyId || null,
        projectId: projectId || null,
        category: dto.category,
        details: dto.details,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        company: {
          select: {
            name: true,
          },
        },
      },
    });

    const userName = `${feedback.user.firstName || ''} ${feedback.user.lastName || ''}`.trim() || 'User';
    const userEmail = feedback.user.email;
    const companyName = feedback.company?.name || null;

    // Dispatch notification email
    try {
      await this.email.sendDevFeedbackEmail({
        userEmail,
        userName,
        companyName,
        category: dto.category,
        details: dto.details,
        projectName: projectNumberAndTitle || null,
      });
    } catch (err) {
      console.error('Failed to dispatch support feedback email', err);
    }

    return feedback;
  }
}
