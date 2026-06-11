import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CreateCompanyDto } from './dto/create-company.dto';
import { AddGalleryImageDto } from './dto/add-gallery-image.dto';
import { ClientProjectRequestDto } from './dto/client-project-request.dto';
import { ClientServiceRequestDto } from './dto/client-service-request.dto';
import { FindCitiesUseCase } from './use-cases/find-cities.use-case';
import { FindCategoriesUseCase } from './use-cases/find-categories.use-case';
import { CreateCompanyUseCase } from './use-cases/create-company.use-case';
import { FindMeUseCase } from './use-cases/find-me.use-case';
import {
  FindPublicListUseCase,
  type FindPublicListParams,
} from './use-cases/find-public-list.use-case';
import { FindCompanyBySlugUseCase } from './use-cases/find-company-by-slug.use-case';
import { PublishCompanyUseCase } from './use-cases/publish-company.use-case';
import { UpdateCompanyUseCase } from './use-cases/update-company.use-case';
import { AddGalleryImageUseCase } from './use-cases/add-gallery-image.use-case';
import { RemoveGalleryImageUseCase } from './use-cases/remove-gallery-image.use-case';
import { RequestPublicServiceUseCase } from './use-cases/request-public-service.use-case';
import { RequestPublicProjectUseCase } from './use-cases/request-public-project.use-case';
import { GetBookingSlotsUseCase } from './use-cases/get-booking-slots.use-case';
import { GetCompanyAuditLogsUseCase } from './use-cases/get-company-audit-logs.use-case';
import { GetPricingModifiersUseCase } from './use-cases/get-pricing-modifiers.use-case';
import { UpdatePricingModifiersUseCase } from './use-cases/update-pricing-modifiers.use-case';

export type { FindPublicListParams };

@Injectable()
export class CompaniesService {
  constructor(
    private readonly findCitiesUc: FindCitiesUseCase,
    private readonly findCategoriesUc: FindCategoriesUseCase,
    private readonly createCompanyUc: CreateCompanyUseCase,
    private readonly findMeUc: FindMeUseCase,
    private readonly findPublicListUc: FindPublicListUseCase,
    private readonly findCompanyBySlugUc: FindCompanyBySlugUseCase,
    private readonly publishCompanyUc: PublishCompanyUseCase,
    private readonly updateCompanyUc: UpdateCompanyUseCase,
    private readonly addGalleryImageUc: AddGalleryImageUseCase,
    private readonly removeGalleryImageUc: RemoveGalleryImageUseCase,
    private readonly requestPublicServiceUc: RequestPublicServiceUseCase,
    private readonly requestPublicProjectUc: RequestPublicProjectUseCase,
    private readonly getBookingSlotsUc: GetBookingSlotsUseCase,
    private readonly getCompanyAuditLogsUc: GetCompanyAuditLogsUseCase,
    private readonly getPricingModifiersUc: GetPricingModifiersUseCase,
    private readonly updatePricingModifiersUc: UpdatePricingModifiersUseCase,
  ) {}

  findCities() {
    return this.findCitiesUc.execute();
  }

  findCategories() {
    return this.findCategoriesUc.execute();
  }

  create(user: JwtPayload, dto: CreateCompanyDto) {
    return this.createCompanyUc.execute(user, dto);
  }

  findMe(user: JwtPayload) {
    return this.findMeUc.execute(user);
  }

  findPublicList(params: FindPublicListParams) {
    return this.findPublicListUc.execute(params);
  }

  findBySlug(slug: string) {
    return this.findCompanyBySlugUc.execute(slug);
  }

  publish(user: JwtPayload, companyId: string) {
    return this.publishCompanyUc.execute(user, companyId);
  }

  update(user: JwtPayload, companyId: string, data: Partial<CreateCompanyDto>) {
    return this.updateCompanyUc.execute(user, companyId, data);
  }

  addGalleryImage(user: JwtPayload, companyId: string, dto: AddGalleryImageDto) {
    return this.addGalleryImageUc.execute(user, companyId, dto);
  }

  removeGalleryImage(user: JwtPayload, companyId: string, imageId: string) {
    return this.removeGalleryImageUc.execute(user, companyId, imageId);
  }

  requestPublicService(
    user: JwtPayload,
    companySlug: string,
    serviceId: string,
    body: ClientServiceRequestDto,
  ) {
    return this.requestPublicServiceUc.execute(user, companySlug, serviceId, body);
  }

  requestPublicProject(user: JwtPayload, companySlug: string, body: ClientProjectRequestDto) {
    return this.requestPublicProjectUc.execute(user, companySlug, body);
  }

  getBookingSlots(companySlug: string, from?: string) {
    return this.getBookingSlotsUc.execute(companySlug, from);
  }

  getAuditLogs(
    user: JwtPayload,
    companyId: string,
    query: { action?: string; userId?: string; limit?: number },
  ) {
    return this.getCompanyAuditLogsUc.execute(user, companyId, query);
  }

  getPricingModifiers(user: JwtPayload, companyId: string) {
    return this.getPricingModifiersUc.execute(user, companyId);
  }

  updatePricingModifiers(
    user: JwtPayload,
    companyId: string,
    modifiers: Record<string, number | null>,
  ) {
    return this.updatePricingModifiersUc.execute(user, companyId, modifiers);
  }
}
