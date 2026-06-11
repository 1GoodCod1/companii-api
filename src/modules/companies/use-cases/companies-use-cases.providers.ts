import { AddGalleryImageUseCase } from './add-gallery-image.use-case';
import { CreateCompanyUseCase } from './create-company.use-case';
import { FindCategoriesUseCase } from './find-categories.use-case';
import { FindCitiesUseCase } from './find-cities.use-case';
import { FindCompanyBySlugUseCase } from './find-company-by-slug.use-case';
import { FindMeUseCase } from './find-me.use-case';
import { FindPublicListUseCase } from './find-public-list.use-case';
import { PublishCompanyUseCase } from './publish-company.use-case';
import { RemoveGalleryImageUseCase } from './remove-gallery-image.use-case';
import { RequestPublicProjectUseCase } from './request-public-project.use-case';
import { RequestPublicServiceUseCase } from './request-public-service.use-case';
import { UpdateCompanyUseCase } from './update-company.use-case';
import { GetBookingSlotsUseCase } from './get-booking-slots.use-case';
import { GetCompanyAuditLogsUseCase } from './get-company-audit-logs.use-case';
import { GetPricingModifiersUseCase } from './get-pricing-modifiers.use-case';
import { UpdatePricingModifiersUseCase } from './update-pricing-modifiers.use-case';

export const COMPANIES_USE_CASE_PROVIDERS = [
  FindCitiesUseCase,
  FindCategoriesUseCase,
  CreateCompanyUseCase,
  FindMeUseCase,
  FindPublicListUseCase,
  FindCompanyBySlugUseCase,
  PublishCompanyUseCase,
  UpdateCompanyUseCase,
  AddGalleryImageUseCase,
  RemoveGalleryImageUseCase,
  RequestPublicServiceUseCase,
  RequestPublicProjectUseCase,
  GetBookingSlotsUseCase,
  GetCompanyAuditLogsUseCase,
  GetPricingModifiersUseCase,
  UpdatePricingModifiersUseCase,
];
