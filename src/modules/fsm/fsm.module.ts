import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FsmService } from './fsm.service';
import {
  FsmAnalyticsController,
  FsmCalendarController,
  FsmCrewsController,
  FsmCustomersController,
  FsmExportController,
  FsmInterventionsController,
  FsmInvoicesController,
  FsmLeadsController,
  FsmQuotesController,
  FsmServicesController,
  FsmPipelineController,
  FsmSearchController,
} from './controllers';
import { LeadsService } from './services/leads/leads.service';
import { InvoicePdfModule } from './pdf/invoice-pdf.module';
import { CustomerImportService } from './customer-import/customer-import.service';
import { FsmContextService } from './context/fsm-context.service';
import { CalendarService } from './services/interventions/calendar.service';
import { CompanyServicesService } from './services/interventions/company-services.service';
import { CrewsService } from './services/interventions/crews.service';
import { CustomerTimelineService } from './services/customers/customer-timeline.service';
import { CustomersService } from './services/customers/customers.service';
import { InterventionNotesService } from './services/interventions/intervention-notes.service';
import { InterventionPhotosService } from './services/interventions/intervention-photos.service';
import { InterventionsService } from './services/interventions/interventions.service';
import { InterventionLifecycleService } from './services/interventions/intervention-lifecycle.service';
import { InvoicesService } from './services/invoices/invoices.service';
import { QuotesService } from './services/quotes/quotes.service';
import { InvoiceQueriesService } from './services/invoices/invoice-queries.service';
import { InvoicePdfCacheService } from './services/invoices/invoice-pdf-cache.service';
import { InvoiceLifecycleService } from './services/invoices/invoice-lifecycle.service';
import { FsmAnalyticsService } from './services/analytics/fsm-analytics.service';
import { PipelineService } from './services/pipeline/pipeline.service';
import { GlobalSearchService } from './services/search/global-search.service';

@Module({
  imports: [forwardRef(() => AuthModule), CompaniesModule, InvoicePdfModule, FilesModule, NotificationsModule],
  controllers: [
    FsmCustomersController,
    FsmInterventionsController,
    FsmLeadsController,
    FsmCalendarController,
    FsmServicesController,
    FsmQuotesController,
    FsmInvoicesController,
    FsmExportController,
    FsmCrewsController,
    FsmAnalyticsController,
    FsmPipelineController,
    FsmSearchController,
  ],
  providers: [
    FsmContextService,
    CustomersService,
    InterventionsService,
    InterventionLifecycleService,
    InterventionNotesService,
    InterventionPhotosService,
    QuotesService,
    InvoicesService,
    InvoiceQueriesService,
    InvoicePdfCacheService,
    InvoiceLifecycleService,
    CalendarService,
    CustomerTimelineService,
    CompanyServicesService,
    CrewsService,
    FsmService,
    LeadsService,
    CustomerImportService,
    FsmAnalyticsService,
    PipelineService,
    GlobalSearchService,
  ],
  exports: [InvoiceLifecycleService],
})
export class FsmModule {}
