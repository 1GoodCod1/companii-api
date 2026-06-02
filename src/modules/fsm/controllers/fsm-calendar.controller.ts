import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FsmService } from '../fsm.service';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';

@Controller(`${CONTROLLER_PATH.fsm}/calendar`)
export class FsmCalendarController {
  constructor(private readonly fsm: FsmService) {}

  @Get()
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('calendar')
  calendar(
    @CurrentUser() user: JwtPayload,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('board') board?: string,
  ) {
    if (board === '1' || board === 'true') {
      return this.fsm.calendarBoard(user, from, to);
    }
    return this.fsm.calendar(user, from, to);
  }
}
