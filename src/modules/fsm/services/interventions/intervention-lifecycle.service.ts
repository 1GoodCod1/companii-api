import { Injectable, Logger } from '@nestjs/common';
import { InterventionStatus, NotificationCategory, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { BookingAvailabilityService } from '../../../companies/booking/booking-availability.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { FsmContextService } from '../../context/fsm-context.service';
import {
  assertInterventionTransition,
  isTerminalInterventionStatus,
} from '../../utils/status-transitions';
import { EmailService } from '../../../email/email.service';
import { NotificationsSenderService } from '../../../notifications/services/notifications-sender.service';
import { notifyPortalClient } from '../../utils/notify-portal-client.util';
import { isEstimateLaborLine } from '../../../estimates/utils/calculation/estimate-line-recalculate.util';
import { reconcileEstimateProjectLifecycle } from '../../../estimates/utils/project/estimate-lifecycle.util';

@Injectable()
export class InterventionLifecycleService {
  private readonly logger = new Logger(InterventionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
    private readonly email: EmailService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsSenderService,
    private readonly availability: BookingAvailabilityService,
  ) {}

  async updateStatus(
    user: JwtPayload,
    id: string,
    toStatus: InterventionStatus,
    note?: string,
  ) {
    const existing = await this.prisma.intervention.findFirst({
      where: {
        id,
        companyId: this.ctx.companyId(user),
        ...this.ctx.technicianInterventionFilter(user),
      },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (isTerminalInterventionStatus(existing.status)) {
      throw AppErrors.badRequest(AppErrorMessages.STATUS_LOCKED);
    }

    try {
      assertInterventionTransition(existing.status, toStatus, user.companyRole);
    } catch {
      throw AppErrors.badRequest(AppErrorMessages.STATUS_TRANSITION_INVALID);
    }

    if (toStatus === 'SCHEDULED' && !existing.scheduledAt) {
      throw AppErrors.badRequest('Nu se poate schimba statusul în PROGRAMAT fără o dată stabilită.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Guard against double-booking when a work moves into SCHEDULED.
      if (toStatus === 'SCHEDULED' && existing.scheduledAt) {
        await this.availability.lockCompany(tx, existing.companyId);
        await this.availability.assertCompanySlotFree(
          tx,
          existing.companyId,
          existing.scheduledAt,
          existing.durationMinutes,
          id,
        );
      }
      const updated = await tx.intervention.update({
        where: { id },
        data: { status: toStatus },
      });
      if (user.memberId) {
        await tx.interventionStatusHistory.create({
          data: {
            interventionId: id,
            fromStatus: existing.status,
            toStatus,
            changedByMemberId: user.memberId,
            note: note?.trim() || `Status schimbat în ${toStatus}`,
          },
        });
      }
      if (toStatus === 'CANCELLED' && existing.estimateProjectId) {
        await reconcileEstimateProjectLifecycle(tx, existing.estimateProjectId);
      }
      return updated;
    });

    if (toStatus === 'COMPLETED' && existing.estimateProjectId) {
      void this.notifyManagersAboutPendingReceipts(
        existing.companyId,
        existing.number,
        existing.estimateProjectId,
      ).catch((err) =>
        this.logger.error('Failed to notify managers about pending receipts', err),
      );
    }

    if (toStatus === 'SCHEDULED') {
      const when = existing.scheduledAt
        ? ` pentru ${existing.scheduledAt.toLocaleString('ro-MD')}`
        : '';
      void notifyPortalClient(
        this.prisma,
        this.notifications,
        { customerId: existing.customerId },
        {
          title: 'Lucrare programată',
          message: `Lucrarea #${existing.number} a fost programată${when}.`,
          category: NotificationCategory.INTERVENTION_SCHEDULED,
          link: '/portal/lucrari',
          i18nKey: 'interventionScheduled',
          params: {
            number: existing.number,
            scheduledAt: existing.scheduledAt ? existing.scheduledAt.toISOString() : '',
          },
          meta: { interventionId: existing.id, number: existing.number },
        },
      );
    } else if (toStatus === 'COMPLETED') {
      void notifyPortalClient(
        this.prisma,
        this.notifications,
        { customerId: existing.customerId },
        {
          title: 'Lucrare finalizată',
          message: `Lucrarea #${existing.number} a fost finalizată.`,
          category: NotificationCategory.INTERVENTION_COMPLETED,
          link: '/portal/lucrari',
          i18nKey: 'interventionCompleted',
          params: { number: existing.number },
          meta: { interventionId: existing.id, number: existing.number },
        },
      );
    }

    await this.cache.invalidateAnalytics(existing.companyId);

    return result;
  }

  private async notifyManagersAboutPendingReceipts(
    companyId: string,
    interventionNumber: string,
    projectId: string,
  ) {
    const project = await this.prisma.runOutsideRlsContext(() =>
      this.prisma.estimateProject.findUnique({
        where: { id: projectId },
        include: {
          stages: {
            include: {
              lines: {
                where: { actualStatus: 'PENDING' },
              },
            },
          },
        },
      }),
    );

    if (!project) return;

    let pendingCount = 0;
    let pendingTotal = 0;

    if (project.stages) {
      for (const stage of project.stages) {
        if (stage.lines) {
          for (const line of stage.lines) {
            const isLabor = isEstimateLaborLine({
              unit: line.unit,
              description: line.description,
              stageKind: stage.kind,
            });
            if (!isLabor) {
              pendingCount++;
              pendingTotal += Number(line.lineTotal);
            }
          }
        }
      }
    }

    if (pendingCount === 0) return;

    // Load active OWNER / MANAGERS of the company
    const company = await this.prisma.runOutsideRlsContext(() =>
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          name: true,
          contactEmail: true,
          owner: { select: { email: true } },
          members: {
            where: { status: 'ACTIVE', role: { in: ['OWNER', 'MANAGER'] } },
            select: { user: { select: { email: true } } },
          },
        },
      }),
    );

    if (!company) return;

    const recipients = [
      company.owner.email,
      company.contactEmail,
      ...company.members.map((m) => m.user.email),
    ].filter((email): email is string => Boolean(email));

    const uniqueRecipients = [...new Set(recipients)];
    if (!uniqueRecipients.length) return;

    for (const to of uniqueRecipients) {
      await this.email.sendCompletedInterventionPendingReceiptsEmail({
        to,
        interventionNumber,
        projectName: project.title,
        pendingCount,
        pendingTotal,
      });
    }
  }

  async updateChecklistProgress(
    user: JwtPayload,
    interventionId: string,
    progress: Record<string, boolean>,
  ) {
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        id: interventionId,
        companyId: this.ctx.companyId(user),
        ...this.ctx.technicianInterventionFilter(user),
      },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.intervention.update({
      where: { id: interventionId },
      data: { checklistProgress: progress },
    });
  }
}
