import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { InvoicePdfModule } from '../fsm/pdf/invoice-pdf.module';
import { EstimatesController } from './controllers/estimates.controller';
import { EstimateTemplatesController } from './controllers/estimate-templates.controller';
import { EstimatesService } from './estimates.service';
import { EstimatesContextService } from './context/estimates-context.service';
import { EstimatePricingEngine } from './pricing/pricing-engine.service';
import { EstimateBlueprintsService } from './services/estimate-blueprints.service';
import { EstimateTemplatesService } from './services/estimate-templates.service';
import { EstimateConversionService } from './services/estimate-conversion.service';
import { EstimatePortalService } from './services/estimate-portal.service';
import { EstimateProjectAccessService } from './services/estimate-project-access.service';
import { EstimateProjectPhotosService } from './services/estimate-project-photos.service';
import { EstimateProjectsService } from './services/estimate-projects.service';
import { EstimateQuotesService } from './services/estimate-quotes.service';
import { EstimateReceiptsService } from './services/estimate-receipts.service';
import { EstimateStagesService } from './services/estimate-stages.service';
import { EstimateWorksheetService } from './services/estimate-worksheet.service';
import { EstimateVersionService } from './services/estimate-version.service';
import { EstimateCommentService } from './services/estimate-comment.service';
import { AuditModule } from '../audit/audit.module';
import { EstimateCalculateProcessor } from './processors/calculate.processor';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [AuthModule, CompaniesModule, InvoicePdfModule, AuditModule, EmailModule],
  controllers: [EstimatesController, EstimateTemplatesController],
  providers: [
    EstimatesContextService,
    EstimateProjectAccessService,
    EstimateBlueprintsService,
    EstimateTemplatesService,
    EstimateProjectsService,
    EstimateProjectPhotosService,
    EstimateStagesService,
    EstimateQuotesService,
    EstimateReceiptsService,
    EstimatePortalService,
    EstimateConversionService,
    EstimateWorksheetService,
    EstimateVersionService,
    EstimateCommentService,
    EstimatesService,
    EstimatePricingEngine,
    EstimateCalculateProcessor,
  ],
  exports: [EstimatesService, EstimateTemplatesService],
})
export class EstimatesModule {}
