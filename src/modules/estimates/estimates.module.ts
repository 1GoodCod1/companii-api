import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { InvoicePdfModule } from '../fsm/pdf/invoice-pdf.module';
import { EstimatesController } from './controllers/estimates.controller';
import { EstimatesService } from './estimates.service';
import { EstimatesContextService } from './context/estimates-context.service';
import { EstimatePricingEngine } from './pricing/pricing-engine.service';
import { EstimateBlueprintsService } from './services/estimate-blueprints.service';
import { EstimateConversionService } from './services/estimate-conversion.service';
import { EstimatePortalService } from './services/estimate-portal.service';
import { EstimateProjectAccessService } from './services/estimate-project-access.service';
import { EstimateProjectsService } from './services/estimate-projects.service';
import { EstimateQuotesService } from './services/estimate-quotes.service';
import { EstimateStagesService } from './services/estimate-stages.service';
import { EstimateWorksheetService } from './services/estimate-worksheet.service';

@Module({
  imports: [AuthModule, CompaniesModule, InvoicePdfModule],
  controllers: [EstimatesController],
  providers: [
    EstimatesContextService,
    EstimateProjectAccessService,
    EstimateBlueprintsService,
    EstimateProjectsService,
    EstimateStagesService,
    EstimateQuotesService,
    EstimatePortalService,
    EstimateConversionService,
    EstimateWorksheetService,
    EstimatesService,
    EstimatePricingEngine,
  ],
  exports: [EstimatesService],
})
export class EstimatesModule {}
