import { Injectable } from '@nestjs/common';
import { EstimateProjectStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/types/jwt-payload';
import type { Plan2dData } from './pricing/pricing-engine.service';
import { EstimateBlueprintsService } from './services/estimate-blueprints.service';
import { EstimateConversionService } from './services/estimate-conversion.service';
import { EstimatePortalService } from './services/estimate-portal.service';
import { EstimateProjectsService } from './services/estimate-projects.service';
import { EstimateQuotesService } from './services/estimate-quotes.service';
import { EstimateStagesService } from './services/estimate-stages.service';
import { EstimateWorksheetService } from './services/estimate-worksheet.service';

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
  ) {}

  listBlueprints() {
    return this.blueprints.list();
  }

  getBlueprintByCategorySlug(slug: string) {
    return this.blueprints.getByCategorySlug(slug);
  }

  listProjects(user: JwtPayload) {
    return this.projects.list(user);
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
      diagnosticAnswers?: Record<string, unknown>;
      notes?: string | null;
      status?: EstimateProjectStatus;
    },
  ) {
    return this.projects.update(user, id, data);
  }

  saveSitePlan(user: JwtPayload, id: string, plan2d: Plan2dData) {
    return this.projects.saveSitePlan(user, id, plan2d);
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

  getProjectPdf(user: JwtPayload, id: string) {
    return this.quotes.getProjectPdf(user, id);
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

  getPortalProjectPdf(customerId: string, projectId: string) {
    return this.portal.getProjectPdf(customerId, projectId);
  }

  getWorksheetByIntervention(user: JwtPayload, interventionId: string) {
    return this.worksheet.getByIntervention(user, interventionId);
  }

  getWorksheetByProject(user: JwtPayload, projectId: string) {
    return this.worksheet.getByProject(user, projectId);
  }
}
