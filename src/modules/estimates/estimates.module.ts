import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { InvoicePdfModule } from '../fsm/pdf/invoice-pdf.module';
import { EstimatesBlueprintsController } from './controllers/estimates-blueprints.controller';
import { EstimateProjectsController } from './controllers/estimate-projects.controller';
import { EstimateFeedbackController } from './controllers/estimate-feedback.controller';
import { EstimateStagesController } from './controllers/estimate-stages.controller';
import { EstimateFeedbackService } from './services/projects/estimate-feedback.service';
import { EstimateQuotesController } from './controllers/estimate-quotes.controller';
import { EstimateReceiptsController } from './controllers/estimate-receipts.controller';
import { EstimateWorksheetController } from './controllers/estimate-worksheet.controller';
import { EstimateReportsController } from './controllers/estimate-reports.controller';
import { EstimateVersionsController } from './controllers/estimate-versions.controller';
import { EstimatePhotosController } from './controllers/estimate-photos.controller';
import { EstimateTemplatesController } from './controllers/estimate-templates.controller';
import { EstimatesService } from './estimates.service';
import { EstimatesContextService } from './context/estimates-context.service';
import { EstimatePricingEngine } from './pricing/pricing-engine.service';
import { EstimateBlueprintsService } from './services/blueprints/estimate-blueprints.service';
import { EstimateTemplatesService } from './services/blueprints/estimate-templates.service';
import { EstimatePortalService } from './services/portal/estimate-portal.service';
import { EstimateProjectAccessService } from './services/projects/estimate-project-access.service';
import { EstimateProjectPhotosService } from './services/projects/estimate-project-photos.service';
import { EstimateProjectsService } from './services/projects/estimate-projects.service';
import { EstimateQuotesService } from './services/projects/estimate-quotes.service';
import { EstimateReceiptsService } from './services/projects/estimate-receipts.service';
import { EstimateStagesService } from './services/projects/estimate-stages.service';
import { EstimateLinesService } from './services/projects/estimate-lines.service';
import { EstimateWorksheetService } from './services/projects/estimate-worksheet.service';
import { EstimateVersionService } from './services/history/estimate-version.service';
import { EstimateProjectActualsService } from './services/projects/estimate-project-actuals.service';
import { EstimateProjectShoppingListService } from './services/projects/estimate-project-shopping-list.service';
import { AuditModule } from '../audit/audit.module';
import { EstimateCalculateProcessor } from './processors/calculate.processor';
import { EmailModule } from '../email/email.module';
import { QueueModule } from '../shared/queue';
import { CreateProjectCommandHandler } from './application/commands/create-project.command';
import { CreateRelatedProjectCommandHandler } from './application/commands/create-related-project.command';
import { DeleteProjectCommandHandler } from './application/commands/delete-project.command';
import { SaveSitePlanCommandHandler } from './application/commands/save-site-plan.command';
import { CalculateProjectCommandHandler } from './application/commands/calculate-project.command';
import { CreateReceiptCommandHandler } from './application/commands/create-receipt.command';
import { LockActualsCommandHandler } from './application/commands/lock-actuals.command';
import { GetProjectQuery } from './application/queries/get-project.query';
import { ListProjectsQuery } from './application/queries/list-projects.query';
import { GetVarianceReportQuery } from './application/queries/get-variance-report.query';
import { ListBlueprintsQuery } from './application/queries/list-blueprints.query';
import { GenerateQuoteUseCase } from './application/use-cases/generate-quote.use-case';
import { SendEstimateToClientUseCase } from './application/use-cases/send-estimate-to-client.use-case';
import { ConvertToInterventionsUseCase } from './application/use-cases/convert-to-interventions.use-case';
import { LineRecalculatorService } from './domain/services/line-recalculator.service';
import { SanityCheckerService } from './domain/services/sanity-checker.service';
import { VarianceCalculatorService } from './domain/services/variance-calculator.service';
import { ESTIMATE_PROJECT_PHOTO_REPOSITORY } from './domain/ports/estimate-project-photo.repository.port';
import { PrismaEstimateProjectPhotoRepository } from './infrastructure/persistence/prisma-estimate-project-photo.repository';
import { ESTIMATE_BLUEPRINT_REPOSITORY } from './domain/ports/estimate-blueprint.repository.port';
import { PrismaEstimateBlueprintRepository } from './infrastructure/persistence/prisma-estimate-blueprint.repository';
import { EstimateCommentModule } from './estimate-comment.module';

@Module({
  imports: [AuthModule, CompaniesModule, InvoicePdfModule, AuditModule, EmailModule, QueueModule, EstimateCommentModule],
  controllers: [
    EstimatesBlueprintsController,
    EstimateProjectsController,
    EstimateStagesController,
    EstimateQuotesController,
    EstimateReceiptsController,
    EstimateWorksheetController,
    EstimateReportsController,
    EstimateVersionsController,
    EstimatePhotosController,
    EstimateTemplatesController,
    EstimateFeedbackController,
  ],
  providers: [
    EstimatesContextService,
    EstimateProjectAccessService,
    EstimateBlueprintsService,
    PrismaEstimateBlueprintRepository,
    {
      provide: ESTIMATE_BLUEPRINT_REPOSITORY,
      useExisting: PrismaEstimateBlueprintRepository,
    },
    EstimateTemplatesService,
    EstimateProjectsService,
    EstimateProjectPhotosService,
    PrismaEstimateProjectPhotoRepository,
    {
      provide: ESTIMATE_PROJECT_PHOTO_REPOSITORY,
      useExisting: PrismaEstimateProjectPhotoRepository,
    },
    EstimateStagesService,
    EstimateLinesService,
    EstimateFeedbackService,
    EstimateQuotesService,
    EstimateReceiptsService,
    EstimatePortalService,
    EstimateWorksheetService,
    EstimateVersionService,
    EstimateProjectActualsService,
    EstimateProjectShoppingListService,
    EstimatesService,
    EstimatePricingEngine,
    EstimateCalculateProcessor,
    LineRecalculatorService,
    SanityCheckerService,
    VarianceCalculatorService,
    GenerateQuoteUseCase,
    SendEstimateToClientUseCase,
    ConvertToInterventionsUseCase,
    CreateProjectCommandHandler,
    CreateRelatedProjectCommandHandler,
    DeleteProjectCommandHandler,
    SaveSitePlanCommandHandler,
    CalculateProjectCommandHandler,
    CreateReceiptCommandHandler,
    LockActualsCommandHandler,
    GetProjectQuery,
    ListProjectsQuery,
    GetVarianceReportQuery,
    ListBlueprintsQuery,
  ],
})
export class EstimatesModule {}
