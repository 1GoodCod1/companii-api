import { Module } from '@nestjs/common';
import { CreatePortalInvitationUseCase } from './create-portal-invitation.use-case';

import { PORTAL_INVITATION_REPOSITORY } from './domain/ports/portal-invitation.repository.port';
import { PrismaPortalInvitationRepository } from './infrastructure/persistence/prisma-portal-invitation.repository';

@Module({
  providers: [
    CreatePortalInvitationUseCase,
    {
      provide: PORTAL_INVITATION_REPOSITORY,
      useClass: PrismaPortalInvitationRepository,
    },
  ],
  exports: [CreatePortalInvitationUseCase],
})
export class PortalInvitationModule {}
