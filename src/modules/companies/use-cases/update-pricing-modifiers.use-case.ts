import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompaniesCoreService } from '../services/companies-core.service';

@Injectable()
export class UpdatePricingModifiersUseCase {
  constructor(private readonly core: CompaniesCoreService) {}

  execute(user: JwtPayload, companyId: string, modifiers: Record<string, number | null>) {
    return this.core.updatePricingModifiers(user, companyId, modifiers);
  }
}
