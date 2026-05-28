import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/types/jwt-payload';
import type { Plan2dData } from './pricing/plan2d.types';
import { EstimateBlueprintsService } from './services/estimate-blueprints.service';
import { EstimateConversionService } from './services/estimate-conversion.service';
import { EstimatePortalService } from './services/estimate-portal.service';
import { EstimateProjectPhotosService } from './services/estimate-project-photos.service';
import { EstimateProjectsService } from './services/estimate-projects.service';
import { EstimateQuotesService } from './services/estimate-quotes.service';
import {
  EstimateReceiptsService,
  type CreateReceiptInput,
} from './services/estimate-receipts.service';
import { EstimateStagesService } from './services/estimate-stages.service';
import { EstimateWorksheetService } from './services/estimate-worksheet.service';
import { EstimateVersionService } from './services/estimate-version.service';
import { EstimateCommentService } from './services/estimate-comment.service';

/** Facade — сохраняет публичный API для EstimatesController и внешних потребителей. */
@Injectable()
export class EstimatesService {
  constructor(
    private readonly blueprints: EstimateBlueprintsService,
    private readonly projects: EstimateProjectsService,
    private readonly stages: EstimateStagesService,
    private readonly quotes: EstimateQuotesService,
    private readonly portal: EstimatePortalService,
    private readonly conversion: EstimateConversionService,
    private readonly worksheet: EstimateWorksheetService,
    private readonly receipts: EstimateReceiptsService,
    private readonly photos: EstimateProjectPhotosService,
    private readonly versions: EstimateVersionService,
    private readonly comments: EstimateCommentService,
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

  // V-02 / V-03 / V-14
  createReceipt(user: JwtPayload, projectId: string, body: CreateReceiptInput) {
    return this.receipts.create(user, projectId, body);
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
    return this.projects.lockActuals(user, projectId);
  }

  unlockActuals(user: JwtPayload, projectId: string) {
    return this.projects.unlockActuals(user, projectId);
  }

  setLinesActualStatus(
    user: JwtPayload,
    projectId: string,
    body: { lineIds: string[]; status: 'NO_RECEIPT' | 'SKIPPED' },
  ) {
    return this.receipts.setLinesStatus(user, projectId, body);
  }

  listBlueprints() {
    return this.blueprints.list();
  }

  getBlueprintByCategorySlug(slug: string) {
    return this.blueprints.getByCategorySlug(slug);
  }

  listProjects(user: JwtPayload, cursor?: string, limit?: number) {
    return this.projects.list(user, cursor, limit);
  }

  getProject(user: JwtPayload, id: string) {
    return this.projects.get(user, id);
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
    return this.projects.create(user, data);
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
    return this.projects.saveSitePlan(user, id, plan2d, options);
  }

  deleteProject(user: JwtPayload, id: string) {
    return this.projects.delete(user, id);
  }

  calculateProject(user: JwtPayload, id: string) {
    return this.stages.calculate(user, id);
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
    return this.stages.updateLine(user, projectId, stageId, lineId, data);
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
    return this.stages.addLine(user, projectId, stageId, data);
  }

  deleteLine(user: JwtPayload, projectId: string, stageId: string, lineId: string) {
    return this.stages.deleteLine(user, projectId, stageId, lineId);
  }

  generateQuote(user: JwtPayload, id: string) {
    return this.quotes.generateQuote(user, id);
  }

  sendToClient(user: JwtPayload, id: string) {
    return this.quotes.sendToClient(user, id);
  }

  getProjectPdf(user: JwtPayload, id: string, lang?: 'ro' | 'ru') {
    return this.quotes.getProjectPdf(user, id, lang);
  }

  // U-04: Returns a readable stream instead of a buffer.
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
    return this.conversion.convertToInterventions(user, id, mode);
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
    return this.projects.getShoppingList(user, projectId);
  }

  getShoppingListPdfStream(user: JwtPayload, projectId: string) {
    return this.projects.getShoppingListPdfStream(user, projectId);
  }

  getVarianceReport(user: JwtPayload, projectId: string) {
    return this.projects.getVarianceReport(user, projectId);
  }

  // V-05: Version history
  listVersions(projectId: string) {
    return this.versions.listVersions(projectId);
  }

  diffVersions(projectId: string, from: number, to: number) {
    return this.versions.diff(projectId, from, to);
  }

  // V-06: Comment thread
  listComments(projectId: string) {
    return this.comments.listComments(projectId);
  }

  addComment(authorId: string, authorKind: 'CLIENT' | 'CONTRACTOR', projectId: string, body: string) {
    return this.comments.addComment(projectId, authorId, authorKind, body);
  }
}
