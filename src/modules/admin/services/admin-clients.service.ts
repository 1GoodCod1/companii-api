import { Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { UpdateAdminClientDto } from '../dto/admin-client.dto';

@Injectable()
export class AdminClientsService {
  constructor(private readonly prisma: PrismaService) {}

  listClients() {
    return this.prisma.user.findMany({
      where: { accountKind: 'END_CLIENT' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        portalCustomer: {
          select: {
            id: true,
            fullName: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async updateClient(id: string, dto: UpdateAdminClientDto) {
    const existing = await this.prisma.user.findFirst({
      where: { id, accountKind: 'END_CLIENT' },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        portalCustomer: {
          select: {
            id: true,
            fullName: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
}
