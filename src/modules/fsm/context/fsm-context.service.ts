import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Injectable()
export class FsmContextService {
  constructor(private readonly prisma: PrismaService) {}

  companyId(user: JwtPayload) {
    if (!user.activeCompanyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }
    return user.activeCompanyId;
  }

  isTechnician(user: JwtPayload) {
    return user.companyRole === 'MEMBER';
  }

  assertNotTechnician(user: JwtPayload) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
  }

  technicianInterventionFilter(user: JwtPayload): Prisma.InterventionWhereInput {
    return this.isTechnician(user) && user.memberId
      ? { technicianId: user.memberId }
      : {};
  }

  async resolveAssignableTechnicianId(
    companyId: string,
    technicianId?: string | null,
  ): Promise<string | undefined> {
    if (!technicianId) return undefined;

    const member = await this.prisma.companyMember.findFirst({
      where: {
        id: technicianId,
        companyId,
        status: 'ACTIVE',
        role: 'MEMBER',
      },
      select: { id: true },
    });

    if (!member) {
      throw AppErrors.badRequest(AppErrorMessages.INTERVENTION_INVALID_TECHNICIAN);
    }

    return member.id;
  }
}
