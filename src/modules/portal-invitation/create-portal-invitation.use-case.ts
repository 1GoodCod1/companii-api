import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PORTAL_INVITATION_REPOSITORY } from './domain/ports/portal-invitation.repository.port';
import type { PrismaPortalInvitationRepository } from './infrastructure/persistence/prisma-portal-invitation.repository';

const PORTAL_INVITE_TTL_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class CreatePortalInvitationUseCase {
  constructor(
    @Inject(PORTAL_INVITATION_REPOSITORY)
    private readonly portalInvitationRepo: PrismaPortalInvitationRepository,
  ) {}

  async execute(customerId: string) {
    const token = `pi_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + PORTAL_INVITE_TTL_MS);

    return await this.portalInvitationRepo.createInvitationAndExpirePending(customerId, token, expiresAt);
  }
}
