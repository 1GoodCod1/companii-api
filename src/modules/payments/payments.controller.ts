import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PaymentProductType } from '@prisma/client';
import { CONTROLLER_PATH } from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../shared/database/prisma.service';
import { CompanyGuard } from '../companies/guards/company.guard';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { CompanyAuthorizationService } from '../companies/company-authorization.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';

@Controller(CONTROLLER_PATH.payments)
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  @Post('subscription/checkout')
  @UseGuards(CompanyGuard)
  @CompanyRoles('OWNER')
  async subscriptionCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { planCode: string; amount: number },
  ) {
    await this.companyAuth.assertCompanyOwner(user);
    return this.prisma.payment.create({
      data: {
        companyId: user.activeCompanyId,
        productType: PaymentProductType.COMPANY_SUBSCRIPTION,
        amount: body.amount,
        status: 'PENDING',
        externalId: `sub_${Date.now()}`,
      },
    });
  }

  @Public()
  @Post('webhook')
  webhook(@Body() body: { externalId: string; status: string }) {
    return this.prisma.withRlsContext(
      { userId: 'system', accountKind: 'PLATFORM_ADMIN' },
      (tx) =>
        tx.payment.updateMany({
          where: { externalId: body.externalId },
          data: { status: body.status },
        }),
    );
  }
}
