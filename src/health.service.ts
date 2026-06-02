import { Injectable } from '@nestjs/common';
import { PrismaService } from './modules/shared/database/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' as const };
    } catch {
      return { status: 'degraded' as const, database: false };
    }
  }
}
