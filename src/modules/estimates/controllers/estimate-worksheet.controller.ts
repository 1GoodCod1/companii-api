import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '../../companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '../../auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesService } from '../estimates.service';

@Controller(CONTROLLER_PATH.estimates)
export class EstimateWorksheetController {
  constructor(private readonly estimates: EstimatesService) {}

  @Get('projects/:id/worksheet')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  worksheetByProject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.getWorksheetByProject(user, id);
  }

  @Get('worksheet/intervention/:interventionId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimateWorksheet')
  worksheetByIntervention(
    @CurrentUser() user: JwtPayload,
    @Param('interventionId') interventionId: string,
  ) {
    return this.estimates.getWorksheetByIntervention(user, interventionId);
  }

  @Get('worksheets/my')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimateWorksheet')
  @CompanyRoles('MEMBER')
  myWorksheets(@CurrentUser() user: JwtPayload) {
    return this.estimates.listMyAssignedWorksheets(user);
  }
}
