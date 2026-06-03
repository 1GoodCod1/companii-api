import { Injectable } from '@nestjs/common';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class GetMeUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        companyMemberships: {
          where: { status: 'ACTIVE' },
          include: { company: true },
        },
        portalCustomers: {
          include: { company: true },
          orderBy: { createdAt: 'asc' },
        },
        ownedCompanies: true,
      },
    });
    if (!user) throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    // Backward-compatible shape: expose a single representative `portalCustomer`
    // (the client may now be a customer of several companies — see portalCustomers).
    return { ...user, portalCustomer: user.portalCustomers[0] ?? null };
  }
}
