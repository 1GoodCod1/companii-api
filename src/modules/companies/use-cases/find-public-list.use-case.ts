import { Injectable } from '@nestjs/common';
import { CompaniesPublicService } from '../services/companies-public.service';

export type FindPublicListParams = {
  cityId?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class FindPublicListUseCase {
  constructor(private readonly publicCatalog: CompaniesPublicService) {}

  execute(params: FindPublicListParams) {
    return this.publicCatalog.findPublicList(params);
  }
}
