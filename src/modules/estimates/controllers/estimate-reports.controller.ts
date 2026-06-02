import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesService } from '../estimates.service';

@Controller(CONTROLLER_PATH.estimates)
export class EstimateReportsController {
  constructor(private readonly estimates: EstimatesService) {}

  @Get('projects/:id/shopping-list')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  getShoppingList(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.estimates.getShoppingList(user, id);
  }

  @Get('projects/:id/shopping-list/pdf')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  async getShoppingListPdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const stream = await this.estimates.getShoppingListPdfStream(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${stream.filename}"`,
      'Transfer-Encoding': 'chunked',
    });
    stream.readable.pipe(res);
  }

  @Get('projects/:id/variance-report')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  getVarianceReport(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.estimates.getVarianceReport(user, id);
  }
}
