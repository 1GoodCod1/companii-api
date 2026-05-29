import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../shared/database/prisma.service';

const PORTAL_INVITE_TTL_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class CreatePortalInvitationUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(customerId: string) {
    const token = `pi_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + PORTAL_INVITE_TTL_MS);

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
