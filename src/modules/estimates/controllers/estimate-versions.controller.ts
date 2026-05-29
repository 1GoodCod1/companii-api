import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '../../companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '../../auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesService } from '../estimates.service';

@Controller(CONTROLLER_PATH.estimates)
export class EstimateVersionsController {
  constructor(private readonly estimates: EstimatesService) {}

  @Get('projects/:id/versions')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  listVersions(@Param('id') id: string) {
    return this.estimates.listVersions(id);
  }

  @Get('projects/:id/versions/diff')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  diffVersions(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.estimates.diffVersions(id, parseInt(from, 10), parseInt(to, 10));
  }

  @Get('projects/:id/comments')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  listComments(@Param('id') id: string) {
    return this.estimates.listComments(id);
  }

  @Post('projects/:id/comments')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  addComment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { body: string },
  ) {
    return this.estimates.addComment(user.sub, 'CONTRACTOR', id, body.body);
  }
}
