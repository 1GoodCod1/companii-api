import { Injectable } from '@nestjs/common';
import { CompaniesPublicService } from '../services/companies-public.service';

@Injectable()
export class FindCompanyBySlugUseCase {
  constructor(private readonly publicCatalog: CompaniesPublicService) {}

  execute(slug: string) {
    return this.publicCatalog.findBySlug(slug);
  }
}
