import { Controller, Get } from '@nestjs/common';
import { CONTROLLER_PATH } from './common/constants';
import { Public } from './common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller(CONTROLLER_PATH.health)
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  check() {
    return this.health.check();
  }
}
