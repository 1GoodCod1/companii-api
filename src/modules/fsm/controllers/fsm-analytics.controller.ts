import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { FsmAnalyticsService } from '../services/analytics/fsm-analytics.service';
import { AnalyticsOverviewQueryDto } from '../dto/analytics.dto';

@Controller(`${CONTROLLER_PATH.fsm}/analytics`)
export class FsmAnalyticsController {
  constructor(private readonly analytics: FsmAnalyticsService) {}

  @Get('overview')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER', 'MANAGER')
  overview(@CurrentUser() user: JwtPayload, @Query() query: AnalyticsOverviewQueryDto) {
    return this.analytics.getOverview(user, query.period);
  }
}
