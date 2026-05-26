import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompaniesCoreService } from '../services/companies-core.service';

@Injectable()
export class FindMeUseCase {
  constructor(private readonly core: CompaniesCoreService) {}

  execute(user: JwtPayload) {
    return this.core.findMe(user);
  }
}
