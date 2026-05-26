import { Injectable } from '@nestjs/common';
import { CompaniesPublicService } from '../services/companies-public.service';

@Injectable()
export class FindCategoriesUseCase {
  constructor(private readonly publicCatalog: CompaniesPublicService) {}

  execute() {
    return this.publicCatalog.findCategories();
  }
}
