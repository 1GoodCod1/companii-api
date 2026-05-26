import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/database/prisma.module';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  imports: [PrismaModule],
  controllers: [SeoController],
  providers: [SeoService],
  exports: [SeoService],
})
export class SeoModule {}
