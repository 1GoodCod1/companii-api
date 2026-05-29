import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompaniesCoreService } from '../services/companies-core.service';

@Injectable()
export class GetPricingModifiersUseCase {
  constructor(private readonly core: CompaniesCoreService) {}

  execute(user: JwtPayload, companyId: string) {
    return this.core.getPricingModifiers(user, companyId);
  }
}
