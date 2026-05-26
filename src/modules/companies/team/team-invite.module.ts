import { Module } from '@nestjs/common';
import { CompanyAuthorizationModule } from '../authorization/company-authorization.module';
import { TeamInviteService } from './team-invite.service';

@Module({
  imports: [CompanyAuthorizationModule],
  providers: [TeamInviteService],
  exports: [TeamInviteService],
})
export class TeamInviteModule {}
