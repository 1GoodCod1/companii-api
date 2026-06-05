import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';

@Injectable()
export class ListProjectsQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
  ) {}

  async execute(user: JwtPayload, cursor?: string, limit = 20) {
    this.ctx.assertManagement(user);
    const take = Math.min(Math.max(limit, 1), 100);
    const items = await this.prisma.estimateProject.findMany({
      where: { companyId: this.ctx.companyId(user) },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        createdAt: true,
        grandTotal: true,
        grandTotalWithVat: true,
        groupId: true,
        group: {
          select: {
            id: true,
            _count: { select: { projects: true } },
          },
        },
        customer: { select: { id: true, fullName: true, phone: true } },
        category: { select: { id: true, name: true, slug: true } },
        quote: { select: { id: true, number: true, status: true } },
        stages: { select: { id: true, name: true, sortOrder: true, stageTotal: true } },
      },
      orderBy: { createdAt: 'desc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take,
    });

    if (!cursor) return items;
    return { items, nextCursor: items.length === take ? items[items.length - 1]?.id : null };
  }
}