import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/types/jwt-payload';
import type { Plan2dData } from './pricing/plan2d.types';
import { EstimateBlueprintsService } from './services/blueprints/estimate-blueprints.service';
import { EstimatePortalService } from './services/portal/estimate-portal.service';
import { EstimateProjectPhotosService } from './services/projects/estimate-project-photos.service';
import { EstimateProjectsService } from './services/projects/estimate-projects.service';
import { EstimateQuotesService } from './services/projects/estimate-quotes.service';
import {
  EstimateReceiptsService,
  type CreateReceiptInput,
} from './services/projects/estimate-receipts.service';
import { EstimateStagesService } from './services/projects/estimate-stages.service';
import { EstimateLinesService } from './services/projects/estimate-lines.service';
import { EstimateWorksheetService } from './services/projects/estimate-worksheet.service';
import { EstimateVersionService } from './services/history/estimate-version.service';
import { EstimateCommentService } from './services/history/estimate-comment.service';
import { EstimateProjectActualsService } from './services/projects/estimate-project-actuals.service';
import { EstimateProjectShoppingListService } from './services/projects/estimate-project-shopping-list.service';
import { CreateProjectCommandHandler } from './application/commands/create-project.command';
import { DeleteProjectCommandHandler } from './application/commands/delete-project.command';
import { SaveSitePlanCommandHandler } from './application/commands/save-site-plan.command';
import { CalculateProjectCommandHandler } from './application/commands/calculate-project.command';
import { CreateReceiptCommandHandler } from './application/commands/create-receipt.command';
import { LockActualsCommandHandler } from './application/commands/lock-actuals.command';
import { GetProjectQuery } from './application/queries/get-project.query';
import { ListProjectsQuery } from './application/queries/list-projects.query';
import { GetVarianceReportQuery } from './application/queries/get-variance-report.query';
import { ListBlueprintsQuery } from './application/queries/list-blueprints.query';
import { GenerateQuoteUseCase } from './application/use-cases/generate-quote.use-case';
import { SendEstimateToClientUseCase } from './application/use-cases/send-estimate-to-client.use-case';
import { ConvertToInterventionsUseCase } from './application/use-cases/convert-to-interventions.use-case';

@Injectable()
export class EstimatesService {
  constructor(
    private readonly blueprints: EstimateBlueprintsService,
    private readonly projects: EstimateProjectsService,
    private readonly stages: EstimateStagesService,
    private readonly quotes: EstimateQuotesService,
    private readonly portal: EstimatePortalService,
    private readonly worksheet: EstimateWorksheetService,
    private readonly receipts: EstimateReceiptsService,
    private readonly photos: EstimateProjectPhotosService,
    private readonly versions: EstimateVersionService,
    private readonly comments: EstimateCommentService,
    private readonly actuals: EstimateProjectActualsService,
    private readonly shoppingList: EstimateProjectShoppingListService,
    private readonly lines: EstimateLinesService,
    private readonly createProjectHandler: CreateProjectCommandHandler,
    private readonly deleteProjectHandler: DeleteProjectCommandHandler,
    private readonly saveSitePlanHandler: SaveSitePlanCommandHandler,
    private readonly calculateProjectHandler: CalculateProjectCommandHandler,
    private readonly createReceiptHandler: CreateReceiptCommandHandler,
    private readonly lockActualsHandler: LockActualsCommandHandler,
    private readonly getProjectQuery: GetProjectQuery,
    private readonly listProjectsQuery: ListProjectsQuery,
    private readonly getVarianceReportQuery: GetVarianceReportQuery,
    private readonly listBlueprintsQuery: ListBlueprintsQuery,
    private readonly generateQuoteUseCase: GenerateQuoteUseCase,
    private readonly sendToClientUseCase: SendEstimateToClientUseCase,
    private readonly convertToInterventionsUseCase: ConvertToInterventionsUseCase,
  ) {}

  listProjectPhotos(user: JwtPayload, projectId: string) {
    return this.photos.list(user, projectId);
  }

  addProjectPhotos(user: JwtPayload, projectId: string, fileKeys: string[], caption?: string) {
    return this.photos.add(user, projectId, fileKeys, caption);
  }

  updateProjectPhotoCaption(
    user: JwtPayload,
    projectId: string,
    photoId: string,
    caption: string | null,
  ) {
    return this.photos.updateCaption(user, projectId, photoId, caption);
  }

  deleteProjectPhoto(user: JwtPayload, projectId: string, photoId: string) {
    return this.photos.delete(user, projectId, photoId);
  }

  createReceipt(user: JwtPayload, projectId: string, body: CreateReceiptInput) {
    return this.createReceiptHandler.execute(user, projectId, body);
  }

  updateReceipt(
    user: JwtPayload,
    projectId: string,
    receiptId: string,
    body: Partial<CreateReceiptInput>,
  ) {
    return this.receipts.update(user, projectId, receiptId, body);
  }

  verifyReceipt(user: JwtPayload, projectId: string, receiptId: string) {
    return this.receipts.verify(user, projectId, receiptId);
  }

  lockActuals(user: JwtPayload, projectId: string) {
    return this.lockActualsHandler.execute(user, projectId);
  }

  unlockActuals(user: JwtPayload, projectId: string) {
    return this.actuals.unlockActuals(user, projectId);
  }

  setLinesActualStatus(
    user: JwtPayload,
    projectId: string,
    body: { lineIds: string[]; status: 'NO_RECEIPT' | 'SKIPPED' },
  ) {
    return this.receipts.setLinesStatus(user, projectId, body);
  }

  listBlueprints() {
    return this.listBlueprintsQuery.execute();
  }

  getBlueprintByCategorySlug(slug: string) {
    return this.blueprints.getByCategorySlug(slug);
  }

  listProjects(user: JwtPayload, cursor?: string, limit?: number) {
    return this.listProjectsQuery.execute(user, cursor, limit);
  }

  getProject(user: JwtPayload, id: string) {
    return this.getProjectQuery.execute(user, id);
  }

  createProject(
    user: JwtPayload,
    data: {
      customerId: string;
      categoryId: string;
      title?: string;
      siteType?: string;
      address?: string;
      validUntil?: string;
    },
  ) {
    return this.createProjectHandler.execute({ user, data });
  }

  updateProject(
    user: JwtPayload,
    id: string,
    data: {
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
      expectedVersion?: number;
      clientMutationId?: string;
      clientDraftId?: string;
    },
  ) {
    return this.projects.update(user, id, data);
  }

  saveSitePlan(
    user: JwtPayload,
    id: string,
    plan2d: Plan2dData,
    options?: {
      expectedVersion?: number;
      clientMutationId?: string;
      clientDraftId?: string;
    },
  ) {
    return this.saveSitePlanHandler.execute(user, id, plan2d, options);
  }

  deleteProject(user: JwtPayload, id: string) {
    return this.deleteProjectHandler.execute(user, id);
  }

  calculateProject(user: JwtPayload, id: string) {
    return this.calculateProjectHandler.execute(user, id);
  }

  updateStage(
    user: JwtPayload,
    projectId: string,
    stageId: string,
    data: {
      name?: string;
      description?: string;
      laborHours?: number;
      laborRate?: number;
      durationDays?: number;
      checklist?: string[];
    },
  ) {
    return this.stages.updateStage(user, projectId, stageId, data);
  }

  updateLine(
    user: JwtPayload,
    projectId: string,
    stageId: string,
    lineId: string,
    data: {
      description?: string;
      qty?: number;
      unit?: string;
      unitPrice?: number;
      materialStore?: string | null;
      receiptFileKey?: string | null;
    },
  ) {
    return this.lines.updateLine(user, projectId, stageId, lineId, data);
  }

  addLine(
    user: JwtPayload,
    projectId: string,
    stageId: string,
    data: {
      description: string;
      qty: number;
      unit: string;
      unitPrice: number;
    },
  ) {
    return this.lines.addLine(user, projectId, stageId, data);
  }

  deleteLine(user: JwtPayload, projectId: string, stageId: string, lineId: string) {
    return this.lines.deleteLine(user, projectId, stageId, lineId);
  }

  generateQuote(user: JwtPayload, id: string) {
    return this.generateQuoteUseCase.execute(user, id);
  }

  sendToClient(user: JwtPayload, id: string) {
    return this.sendToClientUseCase.execute(user, id);
  }

  getProjectPdf(user: JwtPayload, id: string, lang?: 'ro' | 'ru') {
    return this.quotes.getProjectPdf(user, id, lang);
  }

  getProjectPdfStream(user: JwtPayload, id: string, lang?: 'ro' | 'ru') {
    return this.quotes.getProjectPdfStream(user, id, lang);
  }

  updatePortalEstimateStatus(
    customerId: string,
    projectId: string,
    status: 'ACCEPTED' | 'REJECTED',
  ) {
    return this.portal.updateStatus(customerId, projectId, status);
  }

  convertToInterventions(
    user: JwtPayload,
    id: string,
    mode: 'single' | 'by-stage' = 'single',
  ) {
    return this.convertToInterventionsUseCase.execute(user, id, mode);
  }

  getPortalProject(customerId: string, projectId: string) {
    return this.portal.getProject(customerId, projectId);
  }

  getPortalProjectPdf(customerId: string, projectId: string, lang?: 'ro' | 'ru') {
    return this.portal.getProjectPdf(customerId, projectId, lang);
  }

  getWorksheetByIntervention(user: JwtPayload, interventionId: string) {
    return this.worksheet.getByIntervention(user, interventionId);
  }

  getWorksheetByProject(user: JwtPayload, projectId: string) {
    return this.worksheet.getByProject(user, projectId);
  }

  listMyAssignedWorksheets(user: JwtPayload) {
    return this.worksheet.listAssignedForTechnician(user);
  }

  getShoppingList(user: JwtPayload, projectId: string) {
    return this.shoppingList.getShoppingList(user, projectId);
  }

  getShoppingListPdfStream(user: JwtPayload, projectId: string) {
    return this.shoppingList.getShoppingListPdfStream(user, projectId);
  }

  getVarianceReport(user: JwtPayload, projectId: string) {
    return this.getVarianceReportQuery.execute(user, projectId);
  }

  listVersions(projectId: string) {
    return this.versions.listVersions(projectId);
  }

  diffVersions(projectId: string, from: number, to: number) {
    return this.versions.diff(projectId, from, to);
  }

  listComments(projectId: string) {
    return this.comments.listComments(projectId);
  }

  addComment(authorId: string, authorKind: 'CLIENT' | 'CONTRACTOR', projectId: string, body: string) {
    return this.comments.addComment(projectId, authorId, authorKind, body);
  }
}
