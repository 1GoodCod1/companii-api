import { Controller, Get } from '@nestjs/common';
import { CONTROLLER_PATH } from './common/constants';
import { Public } from './common/decorators/public.decorator';
import { PrismaService } from './modules/shared/database/prisma.service';

@Controller(CONTROLLER_PATH.health)
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return { status: 'degraded', database: false };
    }
  }
}
