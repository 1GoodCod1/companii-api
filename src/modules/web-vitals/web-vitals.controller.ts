import {
  Body,
  Controller,
  Get,
  Head,
  HttpCode,
  Logger,
  Post,
  Inject,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CONTROLLER_PATH } from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { WebVitalDto } from './web-vitals.dto';
import { WebVitalsStoreService } from './web-vitals-store.service';

@SkipThrottle()
@Controller(CONTROLLER_PATH.webVitals)
export class WebVitalsController {
  private readonly logger = new Logger(WebVitalsController.name);

  constructor(
    @Inject(WebVitalsStoreService)
    private readonly store: WebVitalsStoreService,
  ) {}

  @Public()
  @Get()
  @Head()
  @HttpCode(204)
  probe(): void {}

  @Public()
  @Post()
  @HttpCode(204)
  report(@Body() dto: WebVitalDto): void {
    this.logger.debug(
      `[CWV ${dto.name}] value=${dto.value} rating=${dto.rating} delta=${dto.delta} id=${dto.id}`,
    );
    // U-11: Store metrics for aggregation and alerting.
    this.store.record(dto);
  }
}
