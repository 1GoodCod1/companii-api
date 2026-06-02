import { Inject, Injectable } from '@nestjs/common';
import type { AdminAuditQueryDto } from '@/modules/admin/dto/admin-audit-query.dto';
import { ADMIN_REPOSITORY } from '../domain/ports/admin.repository.port';
import type { PrismaAdminRepository } from '../infrastructure/persistence/prisma-admin.repository';

@Injectable()
export class AdminStatsService {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: PrismaAdminRepository,
  ) {}

  stats() {
    return this.adminRepo.getStats();
  }

  listWaitlist() {
    return this.adminRepo.listWaitlist();
  }

  listAuditLogs(query: AdminAuditQueryDto) {
    return this.adminRepo.listAuditLogs(query);
  }
}
