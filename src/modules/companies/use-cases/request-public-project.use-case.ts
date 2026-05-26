import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { ClientProjectRequestDto } from '../dto/client-project-request.dto';
import { CompaniesLeadsService } from '../services/companies-leads.service';

@Injectable()
export class RequestPublicProjectUseCase {
  constructor(private readonly leads: CompaniesLeadsService) {}

  execute(user: JwtPayload, companySlug: string, body: ClientProjectRequestDto) {
    return this.leads.requestPublicProject(user, companySlug, body);
  }
}
