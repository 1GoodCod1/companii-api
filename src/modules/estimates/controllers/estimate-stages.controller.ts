import { Body, Controller, Delete, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '@/modules/companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '@/modules/auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesService } from '../estimates.service';
import { QueueService, QUEUE_SMALL_THRESHOLD } from '../../shared/queue';

@Controller(CONTROLLER_PATH.estimates)
export class EstimateStagesController {
  constructor(
    private readonly estimates: EstimatesService,
    private readonly queue: QueueService,
  ) {}

  @Post('projects/:id/calculate')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  async calculate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('forceAsync') forceAsync?: string,
  ) {
    const project = await this.estimates.getProject(user, id);
    const stageCount = project.stages?.length ?? 0;
    const lineCount = project.stages?.reduce((sum, s) => sum + (s.lines?.length ?? 0), 0) ?? 0;
    const isLarge = lineCount > QUEUE_SMALL_THRESHOLD || forceAsync === '1';
    if (isLarge) {
      const jobId = await this.queue.enqueueCalculate({
        projectId: id,
        companyId: user.activeCompanyId ?? '',
        userId: user.sub,
      });
      return { jobId, status: 'queued', lineCount, stageCount };
    }
    return this.estimates.calculateProject(user, id);
  }

  @Patch('projects/:projectId/stages/:stageId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  updateStage(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('stageId') stageId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      laborHours?: number;
      laborRate?: number;
      durationDays?: number;
      checklist?: string[];
    },
  ) {
    return this.estimates.updateStage(user, projectId, stageId, body);
  }

  @Patch('projects/:projectId/stages/:stageId/lines/:lineId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  updateLine(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('stageId') stageId: string,
    @Param('lineId') lineId: string,
    @Body()
    body: {
      description?: string;
      qty?: number;
      unit?: string;
      unitPrice?: number;
      materialStore?: string | null;
      receiptFileKey?: string | null;
    },
  ) {
    return this.estimates.updateLine(user, projectId, stageId, lineId, body);
  }

  @Post('projects/:projectId/stages/:stageId/lines')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  addLine(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('stageId') stageId: string,
    @Body()
    body: {
      description: string;
      qty: number;
      unit: string;
      unitPrice: number;
    },
  ) {
    return this.estimates.addLine(user, projectId, stageId, body);
  }

  @Delete('projects/:projectId/stages/:stageId/lines/:lineId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteLine(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('stageId') stageId: string,
    @Param('lineId') lineId: string,
  ) {
    return this.estimates.deleteLine(user, projectId, stageId, lineId);
  }
}
