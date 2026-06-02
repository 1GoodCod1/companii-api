import { Inject, Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { ADMIN_REPOSITORY } from '../domain/ports/admin.repository.port';
import type { PrismaAdminRepository } from '../infrastructure/persistence/prisma-admin.repository';
import type { UpdateAdminClientDto } from '@/modules/admin/dto/admin-client.dto';

@Injectable()
export class AdminClientsService {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: PrismaAdminRepository,
  ) {}

  listClients() {
    return this.adminRepo.listClients();
  }

  async updateClient(id: string, dto: UpdateAdminClientDto) {
    const existing = await this.adminRepo.findClientById(id);
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return this.adminRepo.updateClient(id, { isActive: dto.isActive });
  }
}
