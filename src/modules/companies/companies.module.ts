import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CompanyAuthorizationModule } from './company-authorization.module';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { WaitlistController } from './waitlist.controller';
import { MembersController } from './members.controller';
import { CompanyGuard } from './guards/company.guard';
import { PortalModule } from '../portal/portal.module';
import { TeamInviteModule } from './team-invite.module';
import { TeamMembersService } from './team-members.service';

@Module({
  imports: [AuthModule, AuditModule, PortalModule, TeamInviteModule, CompanyAuthorizationModule],
  controllers: [MembersController, WaitlistController, CompaniesController],
  providers: [CompaniesService, TeamMembersService, CompanyGuard],
  exports: [CompaniesService, CompanyAuthorizationModule, CompanyGuard],
})
export class CompaniesModule {}
