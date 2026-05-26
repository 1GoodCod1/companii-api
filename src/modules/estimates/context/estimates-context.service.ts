import { Injectable } from '@nestjs/common';
import type { EstimateBlueprintConfig } from '../../../../prisma/estimate-blueprints';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import type { Plan2dData } from '../pricing/pricing-engine.service';

@Injectable()
export class EstimatesContextService {
  companyId(user: JwtPayload) {
    if (!user.activeCompanyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }
    return user.activeCompanyId;
  }

  isTechnician(user: JwtPayload) {
    return user.companyRole === 'MEMBER';
  }

  assertManagement(user: JwtPayload) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
  }

  parseBlueprintConfig(raw: unknown): EstimateBlueprintConfig {
    return raw as EstimateBlueprintConfig;
  }

  parsePlan2d(raw: unknown): Plan2dData | null {
    if (!raw || typeof raw !== 'object') return null;
    return raw as Plan2dData;
  }
}
