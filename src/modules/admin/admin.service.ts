import { Injectable } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import type { JwtPayload } from '../auth/types/jwt-payload';
import type { CreateAdminCategoryDto, UpdateAdminCategoryDto } from './dto/admin-category.dto';
import type { CreateAdminCityDto, UpdateAdminCityDto } from './dto/admin-city.dto';
import type { UpdateAdminClientDto } from './dto/admin-client.dto';
import type { AdminAuditQueryDto } from './dto/admin-audit-query.dto';
import type { CreateAdminBlueprintDto, UpdateAdminBlueprintDto } from './dto/admin-blueprint.dto';
import { AdminClientsService } from './services/admin-clients.service';
import { AdminCompaniesService } from './services/admin-companies.service';
import { AdminModerationService } from './services/admin-moderation.service';
import { AdminReferenceDataService } from './services/admin-reference-data.service';
import { AdminStatsService } from './services/admin-stats.service';
import { AdminBlueprintsService } from './services/admin-blueprints.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly companies: AdminCompaniesService,
    private readonly moderation: AdminModerationService,
    private readonly referenceData: AdminReferenceDataService,
    private readonly statsService: AdminStatsService,
    private readonly clients: AdminClientsService,
    private readonly blueprints: AdminBlueprintsService,
  ) {}

  assertAdmin(user: JwtPayload): void {
    if (user.accountKind !== 'PLATFORM_ADMIN') {
      throw AppErrors.forbidden(AppErrorMessages.GUARD_ACCESS_DENIED);
    }
  }

  pendingCompanies() {
    return this.companies.pendingCompanies();
  }

  getCompany(id: string) {
    return this.companies.getCompany(id);
  }

  verifyCompany(id: string, adminUserId: string, note?: string) {
    return this.companies.verifyCompany(id, adminUserId, note);
  }

  rejectCompany(id: string, adminUserId: string, note?: string) {
    return this.companies.rejectCompany(id, adminUserId, note);
  }

  unpublishCompany(id: string, adminUserId: string, note?: string) {
    return this.companies.unpublishCompany(id, adminUserId, note);
  }

  listCompanies() {
    return this.companies.listCompanies();
  }

  listAuditLogs(query: AdminAuditQueryDto) {
    return this.statsService.listAuditLogs(query);
  }

  listWaitlist() {
    return this.statsService.listWaitlist();
  }

  listReviews() {
    return this.moderation.listReviews();
  }

  moderateReview(id: string, status: ReviewStatus, adminUserId: string) {
    return this.moderation.moderateReview(id, status, adminUserId);
  }

  stats() {
    return this.statsService.stats();
  }

  listCities() {
    return this.referenceData.listCities();
  }

  createCity(dto: CreateAdminCityDto) {
    return this.referenceData.createCity(dto);
  }

  updateCity(id: string, dto: UpdateAdminCityDto) {
    return this.referenceData.updateCity(id, dto);
  }

  deleteCity(id: string) {
    return this.referenceData.deleteCity(id);
  }

  listCategories() {
    return this.referenceData.listCategories();
  }

  createCategory(dto: CreateAdminCategoryDto) {
    return this.referenceData.createCategory(dto);
  }

  updateCategory(id: string, dto: UpdateAdminCategoryDto) {
    return this.referenceData.updateCategory(id, dto);
  }

  deleteCategory(id: string) {
    return this.referenceData.deleteCategory(id);
  }

  listClients() {
    return this.clients.listClients();
  }

  updateClient(id: string, dto: UpdateAdminClientDto) {
    return this.clients.updateClient(id, dto);
  }

  listBlueprints() {
    return this.blueprints.list();
  }

  createBlueprint(dto: CreateAdminBlueprintDto) {
    return this.blueprints.create(dto);
  }

  updateBlueprint(id: string, dto: UpdateAdminBlueprintDto) {
    return this.blueprints.update(id, dto);
  }

  deleteBlueprint(id: string) {
    return this.blueprints.delete(id);
  }
}
