import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/modules/shared/database/prisma.service';
import type { WaitlistRepository } from '../../domain/ports/waitlist.repository.port';

@Injectable()
export class PrismaWaitlistRepository implements WaitlistRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(email: string, companyName: string) {
    return this.prisma.companyWaitlist.create({
      data: { email, companyName },
    });
  }

  findRecent(limit: number) {
    return this.prisma.companyWaitlist.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
