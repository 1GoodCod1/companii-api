import { Injectable } from '@nestjs/common';
import { InterventionStatus, InvoicePaymentStatus, QuoteStatus } from '@prisma/client';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { CalendarService } from './services/calendar.service';
import { CompanyServicesService } from './services/company-services.service';
import { CustomerTimelineService } from './services/customer-timeline.service';
import { CustomersService } from './services/customers.service';
import { InterventionNotesService } from './services/intervention-notes.service';
import { InterventionPhotosService } from './services/intervention-photos.service';
import { InterventionsService } from './services/interventions.service';
import { InvoicesService } from './services/invoices.service';
import { QuotesService } from './services/quotes.service';

/** Facade — сохраняет публичный API для FsmController и внешних потребителей. */
@Injectable()
export class FsmService {
  constructor(
    private readonly customers: CustomersService,
    private readonly interventions: InterventionsService,
    private readonly interventionNotes: InterventionNotesService,
    private readonly interventionPhotos: InterventionPhotosService,
    private readonly quotes: QuotesService,
    private readonly invoices: InvoicesService,
    private readonly calendarService: CalendarService,
    private readonly customerTimeline: CustomerTimelineService,
    private readonly companyServices: CompanyServicesService,
  ) {}

  // --- CUSTOMERS ---

  listCustomers(user: JwtPayload, cursor?: string, limit?: number) {
    return this.customers.list(user, cursor, limit);
  }

  getCustomer(user: JwtPayload, id: string) {
    return this.customers.get(user, id);
  }

  createCustomer(
    user: JwtPayload,
    data: { fullName: string; phone: string; email?: string; address: string; notes?: string },
  ) {
    return this.customers.create(user, data);
  }

  updateCustomer(
    user: JwtPayload,
    id: string,
    data: { fullName?: string; phone?: string; email?: string; address?: string; notes?: string },
  ) {
    return this.customers.update(user, id, data);
  }

  deleteCustomer(user: JwtPayload, id: string) {
    return this.customers.delete(user, id);
  }

  // --- INTERVENTIONS ---

  listInterventions(
    user: JwtPayload,
    filters?: { status?: InterventionStatus; customerId?: string; technicianId?: string },
    cursor?: string,
    limit?: number,
  ) {
    return this.interventions.list(user, filters, cursor, limit);
  }

  getIntervention(user: JwtPayload, id: string) {
    return this.interventions.get(user, id);
  }

  createIntervention(
    user: JwtPayload,
    data: {
      customerId: string;
      type: string;
      description: string;
      address: string;
      technicianId?: string;
      assigneeMemberIds?: string[];
      crewId?: string;
      scheduledAt?: string;
      estimatedPrice?: number;
      internalNotes?: string;
    },
  ) {
    return this.interventions.create(user, data);
  }

  updateIntervention(
    user: JwtPayload,
    id: string,
    data: {
      type?: string;
      description?: string;
      address?: string;
      technicianId?: string | null;
      assigneeMemberIds?: string[];
      crewId?: string | null;
      scheduledAt?: string | null;
      estimatedPrice?: number | null;
      finalPrice?: number | null;
      internalNotes?: string | null;
    },
  ) {
    return this.interventions.update(user, id, data);
  }

  updateInterventionStatus(
    user: JwtPayload,
    id: string,
    toStatus: InterventionStatus,
    note?: string,
  ) {
    return this.interventions.updateStatus(user, id, toStatus, note);
  }

  deleteIntervention(user: JwtPayload, id: string) {
    return this.interventions.delete(user, id);
  }

  updateChecklistProgress(
    user: JwtPayload,
    interventionId: string,
    progress: Record<string, boolean>,
  ) {
    return this.interventions.updateChecklistProgress(user, interventionId, progress);
  }

  // --- NOTES ---

  createInterventionNote(
    user: JwtPayload,
    interventionId: string,
    body: { body: string; isInternal?: boolean },
  ) {
    return this.interventionNotes.create(user, interventionId, body);
  }

  deleteInterventionNote(user: JwtPayload, interventionId: string, noteId: string) {
    return this.interventionNotes.delete(user, interventionId, noteId);
  }

  // --- QUOTES ---

  listQuotes(user: JwtPayload, cursor?: string, limit?: number) {
    return this.quotes.list(user, cursor, limit);
  }

  getQuote(user: JwtPayload, id: string) {
    return this.quotes.get(user, id);
  }

  createQuote(
    user: JwtPayload,
    data: {
      customerId: string;
      interventionId?: string;
      validUntil?: string;
      lines: { description: string; qty: number; unitPrice: number; vatRate?: number; companyServiceId?: string }[];
    },
  ) {
    return this.quotes.create(user, data);
  }

  updateQuote(
    user: JwtPayload,
    id: string,
    data: {
      status?: QuoteStatus;
      validUntil?: string | null;
      lines?: { description: string; qty: number; unitPrice: number; vatRate?: number; companyServiceId?: string }[];
    },
  ) {
    return this.quotes.update(user, id, data);
  }

  deleteQuote(user: JwtPayload, id: string) {
    return this.quotes.delete(user, id);
  }

  convertQuoteToIntervention(user: JwtPayload, id: string) {
    return this.quotes.convertToIntervention(user, id);
  }

  sendQuote(user: JwtPayload, id: string) {
    return this.quotes.send(user, id);
  }

  getQuotePdf(user: JwtPayload, id: string) {
    return this.quotes.getPdf(user, id);
  }

  // --- INVOICES ---

  listInvoices(
    user: JwtPayload,
    cursor?: string,
    limit?: number,
    status?: InvoicePaymentStatus,
  ) {
    return this.invoices.list(user, cursor, limit, status);
  }

  getInvoice(user: JwtPayload, id: string) {
    return this.invoices.get(user, id);
  }

  createInvoice(
    user: JwtPayload,
    data: {
      interventionId: string;
      tvaRate?: number;
      dueDate?: string;
    },
  ) {
    return this.invoices.create(user, data);
  }

  updateInvoice(
    user: JwtPayload,
    id: string,
    data: {
      paymentStatus?: InvoicePaymentStatus;
      dueDate?: string | null;
      paymentReversalReason?: string;
    },
  ) {
    return this.invoices.update(user, id, data);
  }

  deleteInvoice(user: JwtPayload, id: string) {
    return this.invoices.delete(user, id);
  }

  cancelInvoice(user: JwtPayload, id: string, reason: string) {
    return this.invoices.cancel(user, id, reason);
  }

  recordInvoicePayment(
    user: JwtPayload,
    id: string,
    data: { amount: number; note?: string },
  ) {
    return this.invoices.recordPayment(user, id, data);
  }

  sendInvoiceEmail(user: JwtPayload, id: string, customMessage?: string) {
    return this.invoices.sendByEmail(user, id, customMessage);
  }

  getInvoicePdf(user: JwtPayload, id: string) {
    return this.invoices.getPdf(user, id);
  }

  exportInvoicesCsv(user: JwtPayload) {
    return this.invoices.exportCsv(user);
  }

  // --- CALENDAR ---

  calendarBoard(user: JwtPayload, from: string, to: string) {
    return this.calendarService.board(user, from, to);
  }

  calendar(user: JwtPayload, from: string, to: string) {
    return this.calendarService.list(user, from, to);
  }

  // --- CUSTOMER TIMELINE ---

  getCustomerTimeline(user: JwtPayload, customerId: string) {
    return this.customerTimeline.get(user, customerId);
  }

  // --- COMPANY SERVICES ---

  listCompanyServices(user: JwtPayload) {
    return this.companyServices.list(user);
  }

  createCompanyService(
    user: JwtPayload,
    data: {
      name: string;
      defaultPrice: number;
      description?: string;
      categoryId?: string;
      durationMinutes?: number;
      isPublished?: boolean;
      materialsCost?: number;
      vatRate?: number;
      sortOrder?: number;
    },
  ) {
    return this.companyServices.create(user, data);
  }

  updateCompanyService(
    user: JwtPayload,
    id: string,
    data: {
      name?: string;
      defaultPrice?: number;
      description?: string;
      categoryId?: string | null;
      durationMinutes?: number | null;
      isPublished?: boolean;
      materialsCost?: number | null;
      vatRate?: number | null;
      sortOrder?: number;
    },
  ) {
    return this.companyServices.update(user, id, data);
  }

  deleteCompanyService(user: JwtPayload, id: string) {
    return this.companyServices.delete(user, id);
  }

  // --- INTERVENTION PHOTOS ---

  addInterventionPhotos(user: JwtPayload, interventionId: string, fileKeys: string[]) {
    return this.interventionPhotos.add(user, interventionId, fileKeys);
  }

  deleteInterventionPhoto(user: JwtPayload, interventionId: string, photoId: string) {
    return this.interventionPhotos.delete(user, interventionId, photoId);
  }
}
