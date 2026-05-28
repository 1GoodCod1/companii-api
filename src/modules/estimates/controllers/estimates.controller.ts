import {
  Body,
  Controller,
  Query,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { EstimateProjectStatus } from '@prisma/client';
import { CONTROLLER_PATH } from '../../../common/constants';
import { CompanyGuard } from '../../companies/guards/company.guard';
import { CompanyRoles } from '../../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '../../auth/guards/subscription.guard';
import { RequiresFeature } from '../../../common/decorators/requires-feature.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesService } from '../estimates.service';
import { QueueService, QUEUE_SMALL_THRESHOLD } from '../../shared/queue';
import type { Plan2dData } from '../pricing/plan2d.types';

@Controller(CONTROLLER_PATH.estimates)
export class EstimatesController {
  constructor(
    private readonly estimates: EstimatesService,
    private readonly queue: QueueService,
  ) {}

  @Get('blueprints')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  listBlueprints() {
    return this.estimates.listBlueprints();
  }

  @Get('blueprints/category/:slug')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  blueprintBySlug(@Param('slug') slug: string) {
    return this.estimates.getBlueprintByCategorySlug(slug);
  }

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
  @RequiresFeature('estimates')
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
      riskReservePct?: number;
      buildingYear?: number | null;
      siteFloor?: number | null;
      accessDifficulty?: string | null;
      urgency?: string | null;
      diagnosticAnswers?: Record<string, unknown>;
      notes?: string | null;
      status?: EstimateProjectStatus;
      // M-05: conflict resolution metadata
      expectedVersion?: number;
      clientMutationId?: string;
      clientDraftId?: string;
    },
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
    @Body()
    body: {
      plan2d: Plan2dData;
      expectedVersion?: number;
      clientMutationId?: string;
      clientDraftId?: string;
    },
  ) {
    return this.estimates.saveSitePlan(user, id, body.plan2d, {
      expectedVersion: body.expectedVersion,
      clientMutationId: body.clientMutationId,
      clientDraftId: body.clientDraftId,
    });
  }

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

  @Post('projects/:id/generate-quote')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  generateQuote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.generateQuote(user, id);
  }

  @Post('projects/:id/send')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  sendToClient(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.sendToClient(user, id);
  }

  @Post('projects/:id/convert')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  convert(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body?: { mode?: 'single' | 'by-stage' },
  ) {
    return this.estimates.convertToInterventions(user, id, body?.mode ?? 'single');
  }

  @Get('projects/:id/pdf')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  async projectPdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
    @Query('lang') lang?: string,
  ) {
    const validatedLang = lang === 'ru' ? 'ru' : 'ro';
    const stream = await this.estimates.getProjectPdfStream(user, id, validatedLang);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${stream.filename}"`,
      'Transfer-Encoding': 'chunked',
    });
    stream.readable.pipe(res);
  }

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

  // V-02 / V-14: receipts CRUD. MEMBER can create + edit own; OWNER/MANAGER all + verify.
  @Post('projects/:id/receipts')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  createReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: {
      fileKey?: string | null;
      store: string;
      totalAmount: number;
      purchaseDate: string;
      lineUpdates: Array<{
        lineId: string;
        actualUnitPrice: number;
        actualQty?: number;
        actualNotes?: string;
      }>;
    },
  ) {
    return this.estimates.createReceipt(user, id, body);
  }

  @Patch('projects/:id/receipts/:receiptId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  updateReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
    @Body()
    body: {
      fileKey?: string | null;
      store?: string;
      totalAmount?: number;
      purchaseDate?: string;
      lineUpdates?: Array<{
        lineId: string;
        actualUnitPrice: number;
        actualQty?: number;
        actualNotes?: string;
      }>;
    },
  ) {
    return this.estimates.updateReceipt(user, id, receiptId, body);
  }

  @Post('projects/:id/receipts/:receiptId/verify')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  verifyReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
  ) {
    return this.estimates.verifyReceipt(user, id, receiptId);
  }

  @Post('projects/:id/lock-actuals')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  lockActuals(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.estimates.lockActuals(user, id);
  }

  @Post('projects/:id/unlock-actuals')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  unlockActuals(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.estimates.unlockActuals(user, id);
  }
  @Post('projects/:id/lines/actual-status')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  setLinesActualStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { lineIds: string[]; status: 'NO_RECEIPT' | 'SKIPPED' },
  ) {
    return this.estimates.setLinesActualStatus(user, id, body);
  }

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
  @Get('projects/:id/photos')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER', 'MEMBER')
  listPhotos(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.estimates.listProjectPhotos(user, id);
  }

  @Post('projects/:id/photos')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  addPhotos(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { fileKeys: string[]; caption?: string },
  ) {
    return this.estimates.addProjectPhotos(user, id, body.fileKeys, body.caption);
  }

  @Patch('projects/:id/photos/:photoId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  updatePhotoCaption(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Body() body: { caption: string | null },
  ) {
    return this.estimates.updateProjectPhotoCaption(user, id, photoId, body.caption);
  }

  @Delete('projects/:id/photos/:photoId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresFeature('estimates')
  @CompanyRoles('OWNER', 'MANAGER')
  deletePhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    return this.estimates.deleteProjectPhoto(user, id, photoId);
  }

  // V-05: Version history
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

  // V-06: Comment thread
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
