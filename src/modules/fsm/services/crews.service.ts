import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { FsmContextService } from '../context/fsm-context.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

const crewInclude = {
  members: {
    include: {
      member: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          specialization: true,
          role: true,
          status: true,
        },
      },
    },
    orderBy: [{ isLead: 'desc' as const }, { joinedAt: 'asc' as const }],
  },
};

@Injectable()
export class CrewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
  ) {}

  list(user: JwtPayload, opts?: { includeInactive?: boolean }) {
    const cid = this.ctx.companyId(user);
    return this.prisma.crew.findMany({
      where: {
        companyId: cid,
        ...(opts?.includeInactive ? {} : { isActive: true }),
      },
      include: crewInclude,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async get(user: JwtPayload, id: string) {
    const crew = await this.prisma.crew.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: crewInclude,
    });
    if (!crew) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return crew;
  }

  async create(
    user: JwtPayload,
    data: {
      name: string;
      description?: string;
      color?: string;
      memberIds?: string[];
      leadMemberId?: string;
    },
  ) {
    this.ctx.assertNotTechnician(user);
    const cid = this.ctx.companyId(user);

    const name = data.name?.trim();
    if (!name) throw AppErrors.badRequest('Crew name is required.');

    const validatedMemberIds = await this.validateMemberIds(cid, data.memberIds ?? []);
    const leadId =
      data.leadMemberId && validatedMemberIds.includes(data.leadMemberId)
        ? data.leadMemberId
        : validatedMemberIds[0];

    return this.prisma.crew.create({
      data: {
        companyId: cid,
        name,
        description: data.description?.trim() || null,
        color: data.color?.trim() || null,
        members: {
          create: validatedMemberIds.map((memberId) => ({
            memberId,
            isLead: memberId === leadId,
          })),
        },
      },
      include: crewInclude,
    });
  }

  async update(
    user: JwtPayload,
    id: string,
    data: {
      name?: string;
      description?: string | null;
      color?: string | null;
      isActive?: boolean;
      memberIds?: string[];
      leadMemberId?: string;
    },
  ) {
    this.ctx.assertNotTechnician(user);
    const cid = this.ctx.companyId(user);

    const crew = await this.prisma.crew.findFirst({
      where: { id, companyId: cid },
      select: { id: true },
    });
    if (!crew) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.$transaction(async (tx) => {
      await tx.crew.update({
        where: { id },
        data: {
          name: data.name !== undefined ? data.name.trim() : undefined,
          description:
            data.description !== undefined
              ? (data.description?.trim() ?? null) || null
              : undefined,
          color:
            data.color !== undefined ? (data.color?.trim() ?? null) || null : undefined,
          isActive: data.isActive,
        },
      });

      if (data.memberIds !== undefined) {
        const validated = await this.validateMemberIds(cid, data.memberIds);
        const leadId =
          data.leadMemberId && validated.includes(data.leadMemberId)
            ? data.leadMemberId
            : validated[0];

        await tx.crewMember.deleteMany({ where: { crewId: id } });
        if (validated.length > 0) {
          await tx.crewMember.createMany({
            data: validated.map((memberId) => ({
              crewId: id,
              memberId,
              isLead: memberId === leadId,
            })),
          });
        }
      } else if (data.leadMemberId !== undefined) {
        // Just update the lead flag without rewriting the roster.
        await tx.crewMember.updateMany({
          where: { crewId: id, isLead: true },
          data: { isLead: false },
        });
        if (data.leadMemberId) {
          await tx.crewMember.update({
            where: {
              crewId_memberId: { crewId: id, memberId: data.leadMemberId },
            },
            data: { isLead: true },
          });
        }
      }

      return tx.crew.findUniqueOrThrow({ where: { id }, include: crewInclude });
    });
  }

  async delete(user: JwtPayload, id: string) {
    this.ctx.assertNotTechnician(user);
    const cid = this.ctx.companyId(user);
    const crew = await this.prisma.crew.findFirst({
      where: { id, companyId: cid },
      select: { id: true },
    });
    if (!crew) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    await this.prisma.crew.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Ensures every memberId references an ACTIVE member of the given company.
   * Returns the deduplicated, preserved-order list. Throws on any mismatch.
   */
  private async validateMemberIds(companyId: string, raw: string[]): Promise<string[]> {
    const unique = Array.from(new Set(raw.filter((x) => typeof x === 'string' && x.length > 0)));
    if (unique.length === 0) return [];

    const members = await this.prisma.companyMember.findMany({
      where: {
        id: { in: unique },
        companyId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (members.length !== unique.length) {
      throw AppErrors.badRequest('One or more members do not belong to this company.');
    }
    return unique;
  }

  /**
   * Expand a crew into its current member-ID list. Used by InterventionsService
   * when assigning by crewId rather than enumerating members.
   */
  async memberIdsForCrew(companyId: string, crewId: string): Promise<string[]> {
    const crew = await this.prisma.crew.findFirst({
      where: { id: crewId, companyId },
      include: { members: { select: { memberId: true, isLead: true } } },
    });
    if (!crew) throw AppErrors.badRequest('Crew not found for this company.');
    // Lead first so caller can use it as the lead assignee.
    return crew.members
      .slice()
      .sort((a, b) => (a.isLead === b.isLead ? 0 : a.isLead ? -1 : 1))
      .map((m) => m.memberId);
  }
}
