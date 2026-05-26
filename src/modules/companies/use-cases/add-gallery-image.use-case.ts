import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { AddGalleryImageDto } from '../dto/add-gallery-image.dto';
import { CompaniesCoreService } from '../services/companies-core.service';

@Injectable()
export class AddGalleryImageUseCase {
  constructor(private readonly core: CompaniesCoreService) {}

  execute(user: JwtPayload, companyId: string, dto: AddGalleryImageDto) {
    return this.core.addGalleryImage(user, companyId, dto);
  }
}
