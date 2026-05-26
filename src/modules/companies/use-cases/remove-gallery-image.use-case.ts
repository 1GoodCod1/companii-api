import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { CompaniesCoreService } from '../services/companies-core.service';

@Injectable()
export class RemoveGalleryImageUseCase {
  constructor(private readonly core: CompaniesCoreService) {}

  execute(user: JwtPayload, companyId: string, imageId: string) {
    return this.core.removeGalleryImage(user, companyId, imageId);
  }
}
