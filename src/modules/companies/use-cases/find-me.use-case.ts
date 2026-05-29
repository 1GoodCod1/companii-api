import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Injectable()
export class FindMeUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(user: JwtPayload) {
    const companyInclude = {
      subscription: { include: { plan: true } },
      galleryImages: { orderBy: { sortOrder: 'asc' as const } },
    };
    const memberships = await this.prisma.companyMember.findMany({
      where: { userId: user.sub, status: 'ACTIVE' },
      include: { company: { include: companyInclude } },
    });
    const owned = await this.prisma.company.findMany({
      where: { ownerUserId: user.sub },
      include: companyInclude,
    });
    return { memberships, owned };
  }
}
