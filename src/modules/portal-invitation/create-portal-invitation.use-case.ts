import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { PORTAL_INVITATION_REPOSITORY } from './domain/ports/portal-invitation.repository.port';
import type { PrismaPortalInvitationRepository } from './infrastructure/persistence/prisma-portal-invitation.repository';

const PORTAL_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class CreatePortalInvitationUseCase {
  constructor(
    @Inject(PORTAL_INVITATION_REPOSITORY)
    private readonly portalInvitationRepo: PrismaPortalInvitationRepository,
  ) {}

  async execute(companyId: string, customerId: string) {
    const customer = await this.portalInvitationRepo.findCustomerForInvite(
      companyId,
      customerId,
    );
    // Not found = nonexistent OR belongs to another company (ownership guard).
    if (!customer) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }
    // Already has a portal account — re-inviting would be a no-op/confusing.
    if (customer.portalUserId) {
      throw AppErrors.badRequest(AppErrorMessages.PORTAL_ALREADY_LINKED);
    }

    const token = `pi_${randomUUID().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + PORTAL_INVITE_TTL_MS);

    return await this.portalInvitationRepo.createInvitationAndExpirePending(customerId, token, expiresAt);
  }
}
