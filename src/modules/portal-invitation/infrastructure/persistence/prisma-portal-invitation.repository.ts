import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { PortalInvitationRepository } from '../../domain/ports/portal-invitation.repository.port';

@Injectable()
export class PrismaPortalInvitationRepository implements PortalInvitationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCustomerForInvite(companyId: string, customerId: string) {
    return this.prisma.companyCustomer.findFirst({
      where: { id: customerId, companyId },
      select: { portalUserId: true },
    });
  }

  createInvitationAndExpirePending(
    customerId: string,
    token: string,
    expiresAt: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.portalInvitation.updateMany({
        where: {
          customerId,
          status: 'PENDING',
        },
        data: {
          status: 'EXPIRED',
        },
      });

      return tx.portalInvitation.create({
        data: {
          customerId,
          token,
          expiresAt,
        },
        include: {
          customer: {
            select: {
              fullName: true,
              phone: true,
              email: true,
              company: { select: { name: true } },
            },
          },
        },
      });
    });
  }
}
