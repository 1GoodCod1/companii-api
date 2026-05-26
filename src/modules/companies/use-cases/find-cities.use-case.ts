import { Injectable } from '@nestjs/common';
import { CompaniesPublicService } from '../services/companies-public.service';

@Injectable()
export class FindCitiesUseCase {
  constructor(private readonly publicCatalog: CompaniesPublicService) {}

  execute() {
    return this.publicCatalog.findCities();
  }
}
