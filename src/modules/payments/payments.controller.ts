import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { PaymentsService } from './payments.service';

@Controller(CONTROLLER_PATH.payments)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('subscription/checkout')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER')
  async subscriptionCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { planCode: string; amount: number },
  ) {
    return this.payments.createSubscriptionCheckout(
      user.activeCompanyId!,
      body.planCode,
      body.amount,
    );
  }

  @Public()
  @Post('webhook')
  webhook(@Body() body: { externalId: string; status: string }) {
    return this.payments.handleWebhook(body.externalId, body.status);
  }
}
