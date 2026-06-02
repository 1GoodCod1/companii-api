import { Module } from '@nestjs/common';
import { EndClientLinkService } from './end-client-link.service';

@Module({
  providers: [EndClientLinkService],
  exports: [EndClientLinkService],
})
export class EndClientLinkModule {}
