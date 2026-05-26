import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CompanyAuthorizationModule } from './authorization/company-authorization.module';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './controllers/companies.controller';
import { WaitlistController } from './controllers/waitlist.controller';
import { MembersController } from './controllers/members.controller';
import { CompanyGuard } from './guards/company.guard';
import { PortalModule } from '../portal/portal.module';
import { TeamInviteModule } from './team/team-invite.module';
import { TeamMembersService } from './team/team-members.service';
import { CompaniesCoreService } from './services/companies-core.service';
import { CompaniesLeadsService } from './services/companies-leads.service';
import { CompaniesPublicService } from './services/companies-public.service';

@Module({
  imports: [AuthModule, AuditModule, PortalModule, TeamInviteModule, CompanyAuthorizationModule],
  controllers: [MembersController, WaitlistController, CompaniesController],
  providers: [
    CompaniesCoreService,
    CompaniesPublicService,
    CompaniesLeadsService,
    CompaniesService,
    TeamMembersService,
    CompanyGuard,
  ],
  exports: [CompaniesService, CompanyAuthorizationModule, CompanyGuard],
})
export class CompaniesModule {}
