import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { CompanyAuthorizationModule } from './authorization/company-authorization.module';
import { CacheModule } from '../shared/cache/cache.module';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './controllers/companies.controller';
import { WaitlistController } from './controllers/waitlist.controller';
import { MembersController } from './controllers/members.controller';
import { CompanyGuard } from './guards/company.guard';
import { PortalInvitationModule } from '../portal-invitation/portal-invitation.module';
import { TeamInviteModule } from './team/team-invite.module';
import { TeamMembersService } from './team/team-members.service';
import { LeadNotificationService } from './services/lead-notification.service';
import { BookingAvailabilityService } from './booking/booking-availability.service';
import { WaitlistService } from './services/waitlist.service';
import { WAITLIST_REPOSITORY } from './domain/ports/waitlist.repository.port';
import { PrismaWaitlistRepository } from './infrastructure/persistence/prisma-waitlist.repository';
import { COMPANIES_USE_CASE_PROVIDERS } from './use-cases/companies-use-cases.providers';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    AuditModule,
    PortalInvitationModule,
    TeamInviteModule,
    CompanyAuthorizationModule,
    CacheModule,
    NotificationsModule,
  ],
  controllers: [MembersController, WaitlistController, CompaniesController],
  providers: [
    LeadNotificationService,
    BookingAvailabilityService,
    WaitlistService,
    PrismaWaitlistRepository,
    {
      provide: WAITLIST_REPOSITORY,
      useExisting: PrismaWaitlistRepository,
    },
    ...COMPANIES_USE_CASE_PROVIDERS,
    CompaniesService,
    TeamMembersService,
    CompanyGuard,
  ],
  exports: [CompanyAuthorizationModule, BookingAvailabilityService],
})
export class CompaniesModule {}
