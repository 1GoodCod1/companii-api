import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { CompaniesCoreService } from '../services/companies-core.service';

@Injectable()
export class UpdateCompanyUseCase {
  constructor(private readonly core: CompaniesCoreService) {}

  execute(user: JwtPayload, companyId: string, data: Partial<CreateCompanyDto>) {
    return this.core.update(user, companyId, data);
  }
}
