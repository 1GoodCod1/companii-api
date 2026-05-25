import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { EstimateProjectStatus } from '@prisma/client';
import { CONTROLLER_PATH } from '../../common/constants';
import { CompanyGuard } from '../companies/guards/company.guard';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { RequiresPlan } from '../../common/decorators/requires-plan.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { EstimatesService } from './estimates.service';
import type { Plan2dData } from './pricing-engine.service';

@Controller(CONTROLLER_PATH.estimates)
export class EstimatesController {
  constructor(private readonly estimates: EstimatesService) {}

  @Get('blueprints')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  listBlueprints() {
    return this.estimates.listBlueprints();
  }

  @Get('blueprints/category/:slug')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  blueprintBySlug(@Param('slug') slug: string) {
    return this.estimates.getBlueprintByCategorySlug(slug);
  }

  @Get('projects')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  listProjects(@CurrentUser() user: JwtPayload) {
    return this.estimates.listProjects(user);
  }

  @Get('projects/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  getProject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.getProject(user, id);
  }

  @Post('projects')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  createProject(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      customerId: string;
      categoryId: string;
      title?: string;
      siteType?: string;
      address?: string;
      validUntil?: string;
    },
  ) {
    return this.estimates.createProject(user, body);
  }

  @Patch('projects/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  updateProject(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      siteType?: string;
      address?: string;
      validUntil?: string | null;
      marginPct?: number;
      diagnosticAnswers?: Record<string, unknown>;
      notes?: string | null;
      status?: EstimateProjectStatus;
    },
  ) {
    return this.estimates.updateProject(user, id, body);
  }

  @Delete('projects/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteProject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.deleteProject(user, id);
  }

  @Put('projects/:id/site-plan')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  saveSitePlan(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { plan2d: Plan2dData },
  ) {
    return this.estimates.saveSitePlan(user, id, body.plan2d);
  }

  @Post('projects/:id/calculate')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  calculate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.calculateProject(user, id);
  }

  @Patch('projects/:projectId/stages/:stageId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
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
  @RequiresPlan('BUSINESS')
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
  @RequiresPlan('BUSINESS')
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
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteLine(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('stageId') stageId: string,
    @Param('lineId') lineId: string,
  ) {
    return this.estimates.deleteLine(user, projectId, stageId, lineId);
  }

  @Post('projects/:id/generate-quote')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  generateQuote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.generateQuote(user, id);
  }

  @Post('projects/:id/send')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  sendToClient(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.sendToClient(user, id);
  }

  @Post('projects/:id/convert')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  convert(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { mode?: 'single' | 'by-stage' },
  ) {
    return this.estimates.convertToInterventions(user, id, body.mode ?? 'single');
  }

  @Get('projects/:id/pdf')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  async projectPdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.estimates.getProjectPdf(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get('projects/:id/worksheet')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  worksheetByProject(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.getWorksheetByProject(user, id);
  }

  @Get('worksheet/intervention/:interventionId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  worksheetByIntervention(
    @CurrentUser() user: JwtPayload,
    @Param('interventionId') interventionId: string,
  ) {
    return this.estimates.getWorksheetByIntervention(user, interventionId);
  }
}
