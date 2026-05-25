import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CompanySubscriptionPlan } from '@prisma/client';
import { CONTROLLER_PATH } from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CompanyGuard } from '../companies/guards/company.guard';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { ClaimFreePlanDto } from './dto/claim-free-plan.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller(CONTROLLER_PATH.subscriptions)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Get('plans')
  plans() {
    return this.subscriptions.listPlans();
  }

  @Get('me')
  @UseGuards(CompanyGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.subscriptions.me(user.activeCompanyId!);
  }

  @Post('claim-free')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER')
  claimFree(@CurrentUser() user: JwtPayload, @Body() dto: ClaimFreePlanDto) {
    return this.subscriptions.claimFree(user, dto.planCode);
  }

  @Patch('admin/companies/:companyId/plan/:planCode')
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN')
  adminSetPlan(
    @Param('companyId') companyId: string,
    @Param('planCode') planCode: CompanySubscriptionPlan,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.subscriptions.adminSetPlan(companyId, planCode, user.sub);
  }
}
