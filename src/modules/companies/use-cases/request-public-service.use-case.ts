import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { ClientServiceRequestDto } from '../dto/client-service-request.dto';
import { CompaniesLeadsService } from '../services/companies-leads.service';

@Injectable()
export class RequestPublicServiceUseCase {
  constructor(private readonly leads: CompaniesLeadsService) {}

  execute(
    user: JwtPayload,
    companySlug: string,
    serviceId: string,
    body: ClientServiceRequestDto,
  ) {
    return this.leads.requestPublicService(user, companySlug, serviceId, body);
  }
}
