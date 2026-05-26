import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { CompaniesCoreService } from '../services/companies-core.service';

@Injectable()
export class CreateCompanyUseCase {
  constructor(private readonly core: CompaniesCoreService) {}

  execute(user: JwtPayload, dto: CreateCompanyDto) {
    return this.core.create(user, dto);
  }
}
