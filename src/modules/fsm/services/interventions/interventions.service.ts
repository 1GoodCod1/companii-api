import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InterventionStatus, NotificationCategory, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { CompanyAuthorizationService } from '../../../companies/authorization/company-authorization.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CacheService } from '../../../shared/cache/cache.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { FsmContextService } from '../../context/fsm-context.service';
import { technicianWithUser } from '../../fsm.constants';
import { redactInterventionForTechnician } from '../../utils/intervention-field-access.util';
import { resolveInterventionDescriptions } from '../../utils/resolve-intervention-descriptions.util';
import { nextCompanyNumber } from '../../../../common/utils/sequence-number.util';
import { toCursorPage } from '../../../../common/utils/cursor-page.util';
import { CrewsService } from './crews.service';
import { EmailService } from '../../../email/email.service';
import { NotificationsSenderService } from '../../../notifications/services/notifications-sender.service';
import { notifyPortalClient } from '../../utils/notify-portal-client.util';
import { reconcileEstimateProjectLifecycle } from '../../../estimates/utils/project/estimate-lifecycle.util';

const assignmentsInclude = {
  assignments: {
    include: {
      member: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          specialization: true,
        },
      },
    },
    orderBy: [{ isLead: 'desc' as const }, { assignedAt: 'asc' as const }],
  },
  crew: { select: { id: true, name: true, color: true } },
};

@Injectable()
export class InterventionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
    private readonly companyAuth: CompanyAuthorizationService,
    private readonly email: EmailService,
    private readonly crews: CrewsService,
    private readonly config: ConfigService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsSenderService,
  ) {}

  private async notifyAssignedMembers(
    companyId: string,
    intervention: {
      id: string;
      number: string;
      type: string;
      address: string;
      scheduledAt: Date | null;
      customerId: string;
    },
    memberIds: string[],
  ): Promise<void> {
    if (!memberIds.length) return;
    try {
      const [members, company, customer] = await Promise.all([
        this.prisma.companyMember.findMany({
          where: { id: { in: memberIds }, companyId, status: 'ACTIVE' },
          select: { fullName: true, email: true, user: { select: { email: true } } },
        }),
        this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
        this.prisma.companyCustomer.findUnique({
          where: { id: intervention.customerId },
          select: { fullName: true },
        }),
      ]);

      const frontendUrl = this.config.get<string>('frontendUrl') || 'http://localhost:5174';
      const interventionUrl = `${frontendUrl}/company/lucrari?selectedId=${intervention.id}`;
      const scheduledAt = intervention.scheduledAt
        ? intervention.scheduledAt.toLocaleString('ro-MD')
        : null;

      for (const member of members) {
        const to = member.email?.trim() || member.user?.email?.trim();
        if (!to) continue;
        await this.email.sendInterventionAssignedEmail({
          to,
          technicianName: member.fullName,
          companyName: company?.name ?? 'Compania',
          interventionNumber: intervention.number,
          type: intervention.type,
          address: intervention.address,
          customerName: customer?.fullName ?? null,
          scheduledAt,
          interventionUrl,
        });
      }
    } catch {
      // Non-fatal — assignment already persisted.
    }
  }

  private async resolveAssignment(
    companyId: string,
    data: {
      technicianId?: string | null;
      assigneeMemberIds?: string[];
      crewId?: string | null;
    },
  ): Promise<{ memberIds: string[]; leadId: string | null; crewId: string | null } | null> {
    if (data.crewId) {
      const memberIds = await this.crews.memberIdsForCrew(companyId, data.crewId);
      return { memberIds, leadId: memberIds[0] ?? null, crewId: data.crewId };
    }
    if (data.assigneeMemberIds && data.assigneeMemberIds.length > 0) {
      const unique = Array.from(new Set(data.assigneeMemberIds.filter(Boolean)));
      const validated = await this.prisma.companyMember.findMany({
        where: { id: { in: unique }, companyId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (validated.length !== unique.length) {
        throw AppErrors.badRequest(AppErrorMessages.INTERVENTION_INVALID_TECHNICIAN);
      }
      return { memberIds: unique, leadId: unique[0] ?? null, crewId: null };
    }
    if (data.technicianId) {
      const id = await this.ctx.resolveAssignableTechnicianId(companyId, data.technicianId);
      return id ? { memberIds: [id], leadId: id, crewId: null } : null;
    }
    if (data.technicianId === null || data.crewId === null || data.assigneeMemberIds?.length === 0) {
      return { memberIds: [], leadId: null, crewId: null };
    }
    return null;
  }

  async list(
    user: JwtPayload,
    filters?: { status?: InterventionStatus; customerId?: string; technicianId?: string },
    cursor?: string,
    limit = 25,
  ) {
    const where: Prisma.InterventionWhereInput = {
      companyId: this.ctx.companyId(user),
      ...this.ctx.technicianInterventionFilter(user),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.customerId ? { customerId: filters.customerId } : {}),
      ...(filters?.technicianId ? { technicianId: filters.technicianId } : {}),
    };
    const take = Math.min(Math.max(limit, 1), 100);
    const items = await this.prisma.intervention.findMany({
      where,
      select: {
        id: true,
        number: true,
        type: true,
        description: true,
        address: true,
        status: true,
        scheduledAt: true,
        estimatedPrice: true,
        finalPrice: true,
        estimateProjectId: true,
        estimateStageId: true,
        createdAt: true,
        updatedAt: true,
        customer: { select: { id: true, fullName: true, phone: true, email: true } },
        technician: technicianWithUser,
        crew: { select: { id: true, name: true, color: true } },
        assignments: {
          select: {
            memberId: true,
            isLead: true,
            member: { select: { id: true, fullName: true } },
          },
          orderBy: [{ isLead: 'desc' }, { assignedAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take,
    });
    const enriched = await resolveInterventionDescriptions(this.prisma, items, 'staff');
    const mapped = this.ctx.isTechnician(user)
      ? enriched.map((item) => redactInterventionForTechnician(item))
      : enriched;
    return toCursorPage(mapped, take);
  }

  async get(user: JwtPayload, id: string) {
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        id,
        companyId: this.ctx.companyId(user),
        ...this.ctx.technicianInterventionFilter(user),
      },
      include: {
        customer: true,
        technician: technicianWithUser,
        ...assignmentsInclude,
        notes: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              include: { user: { select: { firstName: true, lastName: true } } },
            },
          },
        },
        history: {
          orderBy: { changedAt: 'desc' },
          include: {
            changedBy: {
              include: { user: { select: { firstName: true, lastName: true } } },
            },
          },
        },
        quotes: true,
        invoice: true,
        photos: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    const [enriched] = await resolveInterventionDescriptions(this.prisma, [intervention], 'staff');
    return this.ctx.isTechnician(user)
      ? redactInterventionForTechnician(enriched)
      : enriched;
  }

  async create(
    user: JwtPayload,
    data: {
      customerId: string;
      type: string;
      description: string;
      address: string;
      technicianId?: string;
      assigneeMemberIds?: string[];
      crewId?: string;
      scheduledAt?: string;
      estimatedPrice?: number;
      internalNotes?: string;
    },
  ) {
    const cid = this.ctx.companyId(user);
    await this.companyAuth.assertInterventionMonthlyLimit(cid);
    const assignment = await this.resolveAssignment(cid, {
      technicianId: data.technicianId,
      assigneeMemberIds: data.assigneeMemberIds,
      crewId: data.crewId,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const number = await nextCompanyNumber(tx, {
        companyId: cid,
        namespace: 'intervention-number',
        prefix: 'INT',
        count: (year) =>
          tx.intervention.count({
            where: {
              companyId: cid,
              createdAt: {
                gte: new Date(year, 0, 1),
                lt: new Date(year + 1, 0, 1),
              },
            },
          }),
        exists: async (n) =>
          (await tx.intervention.findUnique({ where: { number: n }, select: { id: true } })) !== null,
      });

      const intervention = await tx.intervention.create({
        data: {
          companyId: cid,
          customerId: data.customerId,
          technicianId: assignment?.leadId ?? undefined,
          crewId: assignment?.crewId ?? undefined,
          number,
          type: data.type,
          description: data.description,
          address: data.address,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
          estimatedPrice: data.estimatedPrice,
          internalNotes: data.internalNotes,
        },
      });

      if (assignment && assignment.memberIds.length > 0) {
        await tx.interventionAssignment.createMany({
          data: assignment.memberIds.map((memberId) => ({
            interventionId: intervention.id,
            memberId,
            isLead: memberId === assignment.leadId,
          })),
        });
      }

      if (user.memberId) {
        await tx.interventionStatusHistory.create({
          data: {
            interventionId: intervention.id,
            toStatus: 'NEW',
            changedByMemberId: user.memberId,
            note: 'Lucrare creată',
          },
        });
      }
      return intervention;
    });
    if (assignment && assignment.memberIds.length > 0) {
      void this.notifyAssignedMembers(cid, created, assignment.memberIds);
    }

    await Promise.all([
      this.cache.invalidateSubscriptionUsage(cid),
      this.cache.invalidateAnalytics(cid),
    ]);

    return created;
  }

  async update(
    user: JwtPayload,
    id: string,
    data: {
      type?: string;
      description?: string;
      address?: string;
      technicianId?: string | null;
      assigneeMemberIds?: string[];
      crewId?: string | null;
      scheduledAt?: string | null;
      estimatedPrice?: number | null;
      finalPrice?: number | null;
      internalNotes?: string | null;
    },
  ) {
    const existing = await this.prisma.intervention.findFirst({
      where: {
        id,
        companyId: this.ctx.companyId(user),
        ...this.ctx.technicianInterventionFilter(user),
      },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (this.ctx.isTechnician(user)) {
      const updateData: Prisma.InterventionUpdateInput = {
        address: data.address,
      };
      return this.prisma.intervention.update({
        where: { id },
        data: updateData,
      });
    }

    const cid = this.ctx.companyId(user);
    const assignment = await this.resolveAssignment(cid, {
      technicianId: data.technicianId,
      assigneeMemberIds: data.assigneeMemberIds,
      crewId: data.crewId,
    });

    const previousMemberIds =
      assignment !== null
        ? new Set(
            (
              await this.prisma.interventionAssignment.findMany({
                where: { interventionId: id },
                select: { memberId: true },
              })
            ).map((a) => a.memberId),
          )
        : new Set<string>();

    const shouldAutoSchedule =
      existing.status === 'NEW' &&
      data.scheduledAt !== undefined &&
      data.scheduledAt !== null;

    const nextScheduledAt = data.scheduledAt === null ? null : data.scheduledAt ? new Date(data.scheduledAt) : existing.scheduledAt;
    const nextStatus = shouldAutoSchedule ? 'SCHEDULED' : existing.status;
    if (nextStatus === 'SCHEDULED' && !nextScheduledAt) {
      throw AppErrors.badRequest('Nu se poate schimba statusul în PROGRAMAT fără o dată stabilită.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (assignment !== null) {
        await tx.interventionAssignment.deleteMany({ where: { interventionId: id } });
        if (assignment.memberIds.length > 0) {
          await tx.interventionAssignment.createMany({
            data: assignment.memberIds.map((memberId) => ({
              interventionId: id,
              memberId,
              isLead: memberId === assignment.leadId,
            })),
          });
        }
      }

      const updateData: Prisma.InterventionUpdateInput = {
        type: data.type,
        description: data.description,
        address: data.address,
        scheduledAt: data.scheduledAt === null ? null : data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        estimatedPrice: data.estimatedPrice === null ? null : data.estimatedPrice,
        finalPrice: data.finalPrice === null ? null : data.finalPrice,
        internalNotes: data.internalNotes === null ? null : data.internalNotes,
      };

      if (shouldAutoSchedule) {
        updateData.status = 'SCHEDULED';
      }

      if (assignment !== null) {
        updateData.technician = assignment.leadId
          ? { connect: { id: assignment.leadId } }
          : { disconnect: true };
        updateData.crew = assignment.crewId
          ? { connect: { id: assignment.crewId } }
          : { disconnect: true };
      }

      const intervention = await tx.intervention.update({
        where: { id },
        data: updateData,
      });

      if (shouldAutoSchedule && user.memberId) {
        await tx.interventionStatusHistory.create({
          data: {
            interventionId: id,
            fromStatus: existing.status,
            toStatus: 'SCHEDULED',
            changedByMemberId: user.memberId,
            note: 'Programată automat (dată stabilită)',
          },
        });
      }

      return intervention;
    });
    if (assignment !== null) {
      const newlyAdded = assignment.memberIds.filter((m) => !previousMemberIds.has(m));
      if (newlyAdded.length > 0) {
        void this.notifyAssignedMembers(cid, updated, newlyAdded);
      }
    }

    if (shouldAutoSchedule) {
      const when = updated.scheduledAt
        ? ` pentru ${updated.scheduledAt.toLocaleString('ro-MD')}`
        : '';
      void notifyPortalClient(
        this.prisma,
        this.notifications,
        { customerId: updated.customerId },
        {
          title: 'Lucrare programată',
          message: `Lucrarea #${updated.number} a fost programată${when}.`,
          category: NotificationCategory.INTERVENTION_SCHEDULED,
          link: '/portal/lucrari',
          i18nKey: 'interventionScheduled',
          params: {
            number: updated.number,
            scheduledAt: updated.scheduledAt ? updated.scheduledAt.toISOString() : '',
          },
          meta: { interventionId: updated.id, number: updated.number },
        },
      );
    }

    await this.cache.invalidateAnalytics(cid);

    return updated;
  }



  async delete(user: JwtPayload, id: string) {
    const companyId = this.ctx.companyId(user);
    const existing = await this.prisma.intervention.findFirst({
      where: { id, companyId },
      include: { invoice: true },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing.status === 'COMPLETED' || existing.status === 'INVOICED' || existing.invoice) {
      throw AppErrors.badRequest('Cannot delete completed or invoiced interventions.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.intervention.delete({ where: { id } });
      if (existing.estimateProjectId) {
        await reconcileEstimateProjectLifecycle(tx, existing.estimateProjectId);
      }
    });
    await Promise.all([
      this.cache.invalidateSubscriptionUsage(companyId),
      this.cache.invalidateAnalytics(companyId),
    ]);
    return { success: true };
  }

}
