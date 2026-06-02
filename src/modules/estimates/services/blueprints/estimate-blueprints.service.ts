import { Inject, Injectable } from '@nestjs/common';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { CacheService } from '../../../shared/cache/cache.service';
import { ESTIMATE_BLUEPRINT_REPOSITORY } from '../../domain/ports/estimate-blueprint.repository.port';
import type { PrismaEstimateBlueprintRepository } from '../../infrastructure/persistence/prisma-estimate-blueprint.repository';

@Injectable()
export class EstimateBlueprintsService {
  constructor(
    @Inject(ESTIMATE_BLUEPRINT_REPOSITORY)
    private readonly blueprintRepo: PrismaEstimateBlueprintRepository,
    private readonly cache: CacheService,
  ) {}

  list() {
    return this.cache.getOrSet(
      this.cache.keys.blueprintsAll(),
      () => this.blueprintRepo.findActive(),
      this.cache.ttl.blueprintsAll,
    );
  }

  async getByCategorySlug(slug: string) {
    const result = await this.cache.getOrSet(
      this.cache.keys.blueprintByCategorySlug(slug),
      async () => {
        const blueprint = await this.blueprintRepo.findActiveByCategorySlug(slug);
        if (!blueprint) return { __not_found: true };
        return blueprint;
      },
      this.cache.ttl.blueprintByCategorySlug,
    );
    if (result && typeof result === 'object' && '__not_found' in result) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }
    return result;
  }
}
