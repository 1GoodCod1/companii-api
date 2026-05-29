import { Injectable } from '@nestjs/common';
import { InterventionStatus, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { CompanyAuthorizationService } from '../../companies/authorization/company-authorization.service';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { FsmContextService } from '../context/fsm-context.service';
import { technicianWithUser } from '../fsm.constants';
import {
  assertInterventionTransition,
  isTerminalInterventionStatus,
} from '../utils/status-transitions';
import { EmailService } from '../../email/email.service';
import { isEstimateLaborLine } from '../../estimates/utils/estimate-line-recalculate.util';
import { CrewsService } from './crews.service';

/** Shape returned for assignments — kept lean for list/get payloads. */
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
  ) {}

  /**
   * Normalize the various ways callers can express assignees into a single
   * { memberIds, leadId, crewId } shape. Precedence: crewId > assigneeMemberIds > technicianId.
   * Returns null when no assignee info was provided (caller should preserve existing state).
   */
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
      // Explicit unassign — clear everything.
      return { memberIds: [], leadId: null, crewId: null };
    }
    return null;
  }

  list(
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
    return this.prisma.intervention.findMany({
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
    }).then((items) => {
      if (!cursor) {
        return items as any;
      }
      return {
        items,
        nextCursor: items.length === take ? items[items.length - 1]?.id : null,
      };
    });
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
    return intervention;
  }

  async create(
    user: JwtPayload,
    data: {
      customerId: string;
      type: string;
      description: string;
      address: string;
      /** Single legacy assignee. */
      technicianId?: string;
      /** Multi-assignee list. First member becomes lead. */
      assigneeMemberIds?: string[];
      /** Assign to an entire crew — expands to its members at creation time. */
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

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.intervention.count({
        where: { companyId: cid },
      });

      let number = `INT-${String(count + 1).padStart(5, '0')}`;
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 15) {
        const existing = await tx.intervention.findUnique({
          where: { number },
        });
        if (!existing) {
          isUnique = true;
        } else {
          attempts++;
          number = `INT-${String(count + 1 + attempts).padStart(5, '0')}`;
        }
      }

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
  }

  async update(
    user: JwtPayload,
    id: string,
    data: {
      type?: string;
      description?: string;
      address?: string;
      technicianId?: string | null;
      /** Replace the full assignee list. Empty array = unassign all. */
      assigneeMemberIds?: string[];
      /** Reassign to a crew (replaces existing assignments). null = clear crew. */
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
        description: data.description,
        address: data.address,
        finalPrice: data.finalPrice === null ? null : data.finalPrice,
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

    return this.prisma.$transaction(async (tx) => {
      // Rewrite assignment table when an explicit assignment payload was given.
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

      if (assignment !== null) {
        updateData.technician = assignment.leadId
          ? { connect: { id: assignment.leadId } }
          : { disconnect: true };
        updateData.crew = assignment.crewId
          ? { connect: { id: assignment.crewId } }
          : { disconnect: true };
      }

      return tx.intervention.update({
        where: { id },
        data: updateData,
      });
    });
  }

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

    const result = await this.prisma.$transaction(async (tx) => {
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
      return updated;
    });

    if (toStatus === 'COMPLETED' && existing.estimateProjectId) {
      this.notifyManagersAboutPendingReceipts(
        existing.companyId,
        existing.number,
        existing.estimateProjectId,
      ).catch(() => {});
    }

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

  async delete(user: JwtPayload, id: string) {
    const existing = await this.prisma.intervention.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: { invoice: true },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing.status === 'COMPLETED' || existing.status === 'INVOICED' || existing.invoice) {
      throw AppErrors.badRequest('Cannot delete completed or invoiced interventions.');
    }

    await this.prisma.intervention.delete({ where: { id } });
    return { success: true };
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
