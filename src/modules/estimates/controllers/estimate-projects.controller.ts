import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesService } from '../estimates.service';
import {
  CreateEstimateProjectDto,
  SaveSitePlanDto,
  UpdateEstimateProjectDto,
} from '../dto/estimate-project.dto';

@Controller(CONTROLLER_PATH.estimates)
export class EstimateProjectsController {
  constructor(private readonly estimates: EstimatesService) {}

  @Get('projects')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  listProjects(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : undefined;
    return this.estimates.listProjects(user, cursor, parsedLimit);
  }

  @Get('projects/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  getProject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.getProject(user, id);
  }

  @Post('projects')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  createProject(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateEstimateProjectDto,
  ) {
    return this.estimates.createProject(user, body);
  }

  @Patch('projects/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  updateProject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateEstimateProjectDto,
  ) {
    return this.estimates.updateProject(user, id, body);
  }

  @Delete('projects/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteProject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.deleteProject(user, id);
  }

  @Put('projects/:id/site-plan')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  saveSitePlan(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: SaveSitePlanDto,
  ) {
    return this.estimates.saveSitePlan(user, id, body.plan2d, {
      expectedVersion: body.expectedVersion,
      clientMutationId: body.clientMutationId,
      clientDraftId: body.clientDraftId,
    });
  }
}
