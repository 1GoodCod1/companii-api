import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { FsmContextService } from '../../context/fsm-context.service';

@Injectable()
export class InterventionNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
  ) {}

  async create(
    user: JwtPayload,
    interventionId: string,
    body: { body: string; isInternal?: boolean },
  ) {
    if (!user.memberId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        id: interventionId,
        companyId: this.ctx.companyId(user),
        ...this.ctx.technicianInterventionFilter(user),
      },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.interventionNote.create({
      data: {
        interventionId,
        authorMemberId: user.memberId,
        body: body.body,
        isInternal: this.ctx.isTechnician(user) ? false : (body.isInternal ?? true),
      },
    });
  }

  async delete(user: JwtPayload, interventionId: string, noteId: string) {
    const note = await this.prisma.interventionNote.findFirst({
      where: {
        id: noteId,
        interventionId,
        intervention: { companyId: this.ctx.companyId(user) },
      },
    });
    if (!note) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (user.companyRole !== 'OWNER' && user.companyRole !== 'MANAGER' && note.authorMemberId !== user.memberId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }

    await this.prisma.interventionNote.delete({ where: { id: noteId } });
    return { success: true };
  }
}
