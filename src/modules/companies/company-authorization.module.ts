import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/database/prisma.module';
import { CompanyAuthorizationService } from './company-authorization.service';

@Module({
  imports: [PrismaModule],
  providers: [CompanyAuthorizationService],
  exports: [CompanyAuthorizationService],
})
export class CompanyAuthorizationModule {}
