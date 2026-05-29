import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { findPortalCustomerForUser } from '../../../common/utils/portal-customer.util';
import { REVIEWABLE_INTERVENTION_STATUSES } from '../../reviews/reviews.types';

@Injectable()
export class GetPortalDashboardUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(user: JwtPayload) {
    const customer = await findPortalCustomerForUser(this.prisma, user.sub);
    const [interventions, quotes, invoices, reviews, estimates] = await this.prisma.inSerial([
      () =>
        this.prisma.intervention.findMany({
          where: { customerId: customer.id },
          orderBy: { updatedAt: 'desc' },
          take: 20,
          include: {
            company: {
              select: { id: true, name: true, slug: true },
            },
            review: {
              select: {
                id: true,
                rating: true,
                comment: true,
                createdAt: true,
              },
            },
          },
        }),
      () =>
        this.prisma.quote.findMany({
          where: { customerId: customer.id, status: { in: ['SENT', 'ACCEPTED', 'CONVERTED'] } },
          orderBy: { createdAt: 'desc' },
        }),
      () =>
        this.prisma.companyInvoice.findMany({
          where: { intervention: { customerId: customer.id } },
          orderBy: { issuedAt: 'desc' },
        }),
      () =>
        this.prisma.companyReview.findMany({
          where: { customerId: customer.id },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            rating: true,
            comment: true,
            clientName: true,
            createdAt: true,
            companyId: true,
            interventionId: true,
            intervention: {
              select: { id: true, number: true, type: true },
            },
          },
        }),
      () =>
        this.prisma.estimateProject.findMany({
          where: {
            customerId: customer.id,
            status: { in: ['SENT', 'ACCEPTED', 'IN_EXECUTION', 'DONE'] },
          },
          orderBy: { updatedAt: 'desc' },
          include: {
            category: { select: { id: true, name: true } },
            company: { select: { id: true, name: true, slug: true } },
          },
        }),
    ]);

    const interventionsWithReviewMeta = interventions.map((item) => ({
      ...item,
      canReview:
        !item.review &&
        REVIEWABLE_INTERVENTION_STATUSES.includes(item.status),
    }));

    return {
      customer,
      interventions: interventionsWithReviewMeta,
      quotes,
      invoices,
      reviews,
      estimates,
    };
  }
}
