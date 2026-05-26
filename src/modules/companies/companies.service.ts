import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CreateCompanyDto } from './dto/create-company.dto';
import { AddGalleryImageDto } from './dto/add-gallery-image.dto';
import { ClientProjectRequestDto } from './dto/client-project-request.dto';
import { ClientServiceRequestDto } from './dto/client-service-request.dto';
import { CompaniesCoreService } from './services/companies-core.service';
import { CompaniesLeadsService } from './services/companies-leads.service';
import { CompaniesPublicService } from './services/companies-public.service';

/** Facade — сохраняет публичный API для CompaniesController. */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly core: CompaniesCoreService,
    private readonly publicCatalog: CompaniesPublicService,
    private readonly leads: CompaniesLeadsService,
  ) {}

  findCities() {
    return this.publicCatalog.findCities();
  }

  findCategories() {
    return this.publicCatalog.findCategories();
  }

  create(user: JwtPayload, dto: CreateCompanyDto) {
    return this.core.create(user, dto);
  }

  findMe(user: JwtPayload) {
    return this.core.findMe(user);
  }

  findPublicList(params: {
    cityId?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
  }) {
    return this.publicCatalog.findPublicList(params);
  }

  findBySlug(slug: string) {
    return this.publicCatalog.findBySlug(slug);
  }

  publish(user: JwtPayload, companyId: string) {
    return this.core.publish(user, companyId);
  }

  update(user: JwtPayload, companyId: string, data: Partial<CreateCompanyDto>) {
    return this.core.update(user, companyId, data);
  }

  addGalleryImage(user: JwtPayload, companyId: string, dto: AddGalleryImageDto) {
    return this.core.addGalleryImage(user, companyId, dto);
  }

  removeGalleryImage(user: JwtPayload, companyId: string, imageId: string) {
    return this.core.removeGalleryImage(user, companyId, imageId);
  }

  requestPublicService(
    user: JwtPayload,
    companySlug: string,
    serviceId: string,
    body: ClientServiceRequestDto,
  ) {
    return this.leads.requestPublicService(user, companySlug, serviceId, body);
  }

  requestPublicProject(
    user: JwtPayload,
    companySlug: string,
    body: ClientProjectRequestDto,
  ) {
    return this.leads.requestPublicProject(user, companySlug, body);
  }
}
