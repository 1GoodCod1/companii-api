import { Injectable } from '@nestjs/common';
import { Prisma, CompanySubscriptionPlan } from '@prisma/client';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { SubscriptionsRepository } from '../../domain/ports/subscriptions.repository.port';

@Injectable()
export class PrismaSubscriptionsRepository implements SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPlans() {
    return this.prisma.companyPlan.findMany({
      orderBy: { price: 'asc' },
    });
  }

  findPlanByCode(code: CompanySubscriptionPlan) {
    return this.prisma.companyPlan.findUnique({
      where: { code },
    });
  }

  findSubscriptionByCompanyId(companyId: string) {
    return this.prisma.companySubscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
  }

  async computeSubscriptionUsage(companyId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const now = new Date();
    const rows = await this.prisma.$queryRaw<
      Array<{
        active_technicians: bigint;
        pending_invites: bigint;
        interventions_this_month: bigint;
      }>
    >`
      SELECT
        (SELECT COUNT(*) FROM company_members cm
           WHERE cm.company_id = ${companyId}
             AND cm.status = 'ACTIVE'
             AND cm.role = 'MEMBER') AS active_technicians,
        (SELECT COUNT(*) FROM company_invitations ci
           WHERE ci.company_id = ${companyId}
             AND ci.status = 'PENDING'
             AND ci.role = 'MEMBER'
             AND ci.expires_at > ${now}) AS pending_invites,
        (SELECT COUNT(*) FROM interventions i
           WHERE i.company_id = ${companyId}
             AND i.created_at >= ${startOfMonth}) AS interventions_this_month
    `;

    const row = rows[0] ?? {
      active_technicians: 0n,
      pending_invites: 0n,
      interventions_this_month: 0n,
    };
    return {
      activeTechnicians: Number(row.active_technicians),
      pendingTechnicianInvites: Number(row.pending_invites),
      interventionsThisMonth: Number(row.interventions_this_month),
    };
  }

  upsertSubscription(
    companyId: string,
    createData: Prisma.CompanySubscriptionUncheckedCreateInput,
    updateData: Prisma.CompanySubscriptionUncheckedUpdateInput,
  ) {
    return this.prisma.companySubscription.upsert({
      where: { companyId },
      create: createData,
      update: updateData,
    });
  }

  updateSubscription(
    companyId: string,
    data: Prisma.CompanySubscriptionUncheckedUpdateInput,
  ) {
    return this.prisma.companySubscription.update({
      where: { companyId },
      data,
      include: { plan: true },
    });
  }
}
