import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { FilesModule } from '../files/files.module';
import { FsmService } from './fsm.service';
import {
  FsmCalendarController,
  FsmCrewsController,
  FsmCustomersController,
  FsmExportController,
  FsmInterventionsController,
  FsmInvoicesController,
  FsmLeadsController,
  FsmQuotesController,
  FsmServicesController,
} from './controllers';
import { LeadsService } from './services/leads.service';
import { InvoicePdfModule } from './pdf/invoice-pdf.module';
import { CustomerImportService } from './customer-import/customer-import.service';
import { FsmContextService } from './context/fsm-context.service';
import { CalendarService } from './services/calendar.service';
import { CompanyServicesService } from './services/company-services.service';
import { CrewsService } from './services/crews.service';
import { CustomerTimelineService } from './services/customer-timeline.service';
import { CustomersService } from './services/customers.service';
import { InterventionNotesService } from './services/intervention-notes.service';
import { InterventionPhotosService } from './services/intervention-photos.service';
import { InterventionsService } from './services/interventions.service';
import { InvoicesService } from './services/invoices.service';
import { QuotesService } from './services/quotes.service';

@Module({
  imports: [AuthModule, CompaniesModule, InvoicePdfModule, FilesModule],
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
  ],
  providers: [
    FsmContextService,
    CustomersService,
    InterventionsService,
    InterventionNotesService,
    InterventionPhotosService,
    QuotesService,
    InvoicesService,
    CalendarService,
    CustomerTimelineService,
    CompanyServicesService,
    CrewsService,
    FsmService,
    LeadsService,
    CustomerImportService,
  ],
  exports: [FsmService, LeadsService, CustomerImportService],
})
export class FsmModule {}
