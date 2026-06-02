import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/database/prisma.module';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { SEO_REPOSITORY } from './domain/ports/seo.repository.port';
import { PrismaSeoRepository } from './infrastructure/persistence/prisma-seo.repository';

@Module({
  imports: [PrismaModule],
  controllers: [SeoController],
  providers: [
    SeoService,
    {
      provide: SEO_REPOSITORY,
      useClass: PrismaSeoRepository,
    },
  ],
})
export class SeoModule {}
