import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CONTROLLER_PATH,
  PUBLIC_READ_THROTTLE_LIMIT,
  PUBLIC_READ_THROTTLE_TTL_MS,
} from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { QuerySeoUrlsDto } from './dto/query-seo-urls.dto';
import { SeoService } from './seo.service';

const PUBLIC_READ_THROTTLE = {
  default: {
    limit: PUBLIC_READ_THROTTLE_LIMIT,
    ttl: PUBLIC_READ_THROTTLE_TTL_MS,
  },
};

@Controller(CONTROLLER_PATH.seo)
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  /**
   * Paginated public URL list for sitemap generation and prerender pipelines.
   * Unauthenticated by design — fed by the CI build script via plain GETs.
   */
  @Public()
  @Get('urls')
  @Throttle(PUBLIC_READ_THROTTLE)
  getUrls(@Query() query: QuerySeoUrlsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 500;
    return this.seo.getUrls(query.kind, page, limit);
  }
}
