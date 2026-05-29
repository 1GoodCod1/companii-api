import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { normalizePhone } from '../../../../common/utils/phone.util';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { FsmContextService } from '../../context/fsm-context.service';
import { technicianWithUser } from '../../fsm.constants';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
  ) {}

  list(user: JwtPayload, cursor?: string, limit = 25) {
    this.ctx.assertNotTechnician(user);
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.companyCustomer.findMany({
      where: { companyId: this.ctx.companyId(user) },
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
    this.ctx.assertNotTechnician(user);
    const customer = await this.prisma.companyCustomer.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: {
        interventions: {
          orderBy: { createdAt: 'desc' },
          include: { technician: technicianWithUser },
        },
        quotes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return customer;
  }

  create(
    user: JwtPayload,
    data: { fullName: string; phone: string; email?: string; address: string; notes?: string },
  ) {
    const normalizedPhone = normalizePhone(data.phone) ?? data.phone.trim();
    return this.prisma.companyCustomer.create({
      data: {
        companyId: this.ctx.companyId(user),
        fullName: data.fullName.trim(),
        phone: normalizedPhone,
        email: data.email?.trim().toLowerCase(),
        address: data.address.trim(),
        notes: data.notes?.trim(),
      },
    });
  }

  async update(
    user: JwtPayload,
    id: string,
    data: { fullName?: string; phone?: string; email?: string; address?: string; notes?: string },
  ) {
    const existing = await this.prisma.companyCustomer.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.companyCustomer.update({
      where: { id },
      data: {
        fullName: data.fullName?.trim(),
        phone: data.phone ? normalizePhone(data.phone) ?? data.phone.trim() : undefined,
        email: data.email?.trim().toLowerCase(),
        address: data.address?.trim(),
        notes: data.notes?.trim(),
      },
    });
  }

  async delete(user: JwtPayload, id: string) {
    const existing = await this.prisma.companyCustomer.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: {
        _count: {
          select: { interventions: true, quotes: true },
        },
      },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing._count.interventions > 0 || existing._count.quotes > 0) {
      throw AppErrors.badRequest(
        'Cannot delete customer with active interventions or quotes.',
      );
    }

    await this.prisma.companyCustomer.delete({ where: { id } });
    return { success: true };
  }
}
