import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { PackagesService } from './packages.service';
import { PackagesController } from './packages.controller';

@Module({
  imports: [CompaniesModule],
  controllers: [PackagesController],
  providers: [PackagesService],
})
export class PackagesModule {}
