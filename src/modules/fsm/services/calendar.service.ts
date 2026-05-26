import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { FsmContextService } from '../context/fsm-context.service';
import { technicianWithUser } from '../fsm.constants';

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
  ) {}

  async board(user: JwtPayload, from: string, to: string) {
    const cid = this.ctx.companyId(user);
    const techFilter = this.ctx.technicianInterventionFilter(user);
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const [scheduled, unscheduled, openLeads] = await this.prisma.inSerial([
      () =>
        this.prisma.intervention.findMany({
          where: {
            companyId: cid,
            scheduledAt: { gte: fromDate, lte: toDate },
            ...techFilter,
          },
          include: { customer: true, technician: technicianWithUser },
          orderBy: { scheduledAt: 'asc' },
        }),
      () =>
        this.prisma.intervention.findMany({
          where: {
            companyId: cid,
            scheduledAt: null,
            status: { in: ['NEW', 'SCHEDULED'] },
            ...techFilter,
          },
          include: { customer: true, technician: technicianWithUser },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      () =>
        this.ctx.isTechnician(user)
          ? Promise.resolve([])
          : this.prisma.companyLead.findMany({
              where: { companyId: cid, status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] } },
              include: {
                category: { select: { id: true, name: true } },
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
            }),
    ]);

    return { scheduled, unscheduled, openLeads };
  }

  list(user: JwtPayload, from: string, to: string) {
    return this.prisma.intervention.findMany({
      where: {
        companyId: this.ctx.companyId(user),
        scheduledAt: { gte: new Date(from), lte: new Date(to) },
        ...this.ctx.technicianInterventionFilter(user),
      },
      include: { customer: true, technician: technicianWithUser },
    });
  }
}
