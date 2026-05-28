import { Module } from '@nestjs/common';
import { WebVitalsController } from './web-vitals.controller';
import { WebVitalsStoreService } from './web-vitals-store.service';

@Module({
  controllers: [WebVitalsController],
  providers: [WebVitalsStoreService],
  exports: [WebVitalsStoreService],
})
export class WebVitalsModule {}
