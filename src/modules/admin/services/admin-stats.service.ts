import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import type { AdminAuditQueryDto } from '../dto/admin-audit-query.dto';

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  stats() {
    return this.prisma.inSerial([
      () => this.prisma.company.count(),
      () => this.prisma.user.count(),
      () => this.prisma.intervention.count(),
      () => this.prisma.companyWaitlist.count(),
    ]).then(([companies, users, interventions, waitlist]) => ({
      companies,
      users,
      interventions,
      waitlist,
    }));
  }

  listWaitlist() {
    return this.prisma.companyWaitlist.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  listAuditLogs(query: AdminAuditQueryDto) {
    const limit = query.limit ?? 50;
    return this.prisma.auditLog.findMany({
      where: {
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.action ? { action: query.action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }
}
