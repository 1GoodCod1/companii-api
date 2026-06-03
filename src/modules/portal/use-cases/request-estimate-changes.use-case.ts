import { Inject, Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PORTAL_REPOSITORY } from '../domain/ports/portal.repository.port';
import type { PrismaPortalRepository } from '../infrastructure/persistence/prisma-portal.repository';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EmailService } from '../../email/email.service';
import { appendClientFeedback } from '../../estimates/utils/portal/client-feedback.util';

@Injectable()
export class RequestEstimateChangesUseCase {
  constructor(
    @Inject(PORTAL_REPOSITORY)
    private readonly portalRepo: PrismaPortalRepository,
    private readonly email: EmailService,
  ) {}

  async execute(user: JwtPayload, projectId: string, comment: string) {
    const trimmed = comment?.trim();
    if (!trimmed) {
      throw AppErrors.badRequest('Comentariul este obligatoriu');
    }
    if (trimmed.length > 2000) {
      throw AppErrors.badRequest('Comentariul depășește 2000 de caractere');
    }

    const { updatedProject, fullProject } = await this.portalRepo.requestEstimateChanges(
      user.sub,
      projectId,
      trimmed,
      (currentFeedback) => appendClientFeedback(currentFeedback, {
        kind: 'REQUEST_CHANGES',
        comment: trimmed,
      }),
    );

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

    return updatedProject;
  }
}
