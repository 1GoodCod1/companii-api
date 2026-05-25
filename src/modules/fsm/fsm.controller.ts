import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { InterventionStatus, InvoicePaymentStatus, QuoteStatus, CompanyLeadStatus } from '@prisma/client';
import { FsmService } from './fsm.service';
import { LeadsService } from './leads.service';
import { CONTROLLER_PATH } from '../../common/constants';
import { CompanyGuard } from '../companies/guards/company.guard';
import { CompanyRoles } from '../companies/decorators/company-roles.decorator';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { RequiresPlan } from '../../common/decorators/requires-plan.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';

@Controller(CONTROLLER_PATH.fsm)
export class FsmController {
  constructor(
    private readonly fsm: FsmService,
    private readonly leads: LeadsService,
  ) {}

  // --- CUSTOMERS ---

  @Get('customers')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  customers(@CurrentUser() user: JwtPayload) {
    return this.fsm.listCustomers(user);
  }

  @Get('customers/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  customer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.getCustomer(user, id);
  }

  @Get('customers/:id/timeline')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  customerTimeline(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.getCustomerTimeline(user, id);
  }

  @Post('customers')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  createCustomer(@CurrentUser() user: JwtPayload, @Body() body: { fullName: string; phone: string; email?: string; address: string; notes?: string }) {
    return this.fsm.createCustomer(user, body);
  }

  @Patch('customers/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  updateCustomer(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { fullName?: string; phone?: string; email?: string; address?: string; notes?: string },
  ) {
    return this.fsm.updateCustomer(user, id, body);
  }

  @Delete('customers/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteCustomer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.deleteCustomer(user, id);
  }

  // --- INTERVENTIONS ---

  @Get('interventions')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  interventions(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: InterventionStatus,
    @Query('customerId') customerId?: string,
    @Query('technicianId') technicianId?: string,
  ) {
    return this.fsm.listInterventions(user, { status, customerId, technicianId });
  }

  @Get('interventions/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  intervention(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.getIntervention(user, id);
  }

  @Post('interventions')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  createIntervention(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      customerId: string;
      type: string;
      description: string;
      address: string;
      technicianId?: string;
      scheduledAt?: string;
      estimatedPrice?: number;
      internalNotes?: string;
    },
  ) {
    return this.fsm.createIntervention(user, body);
  }

  @Patch('interventions/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  updateIntervention(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      type?: string;
      description?: string;
      address?: string;
      technicianId?: string | null;
      scheduledAt?: string | null;
      estimatedPrice?: number | null;
      finalPrice?: number | null;
      internalNotes?: string | null;
    },
  ) {
    return this.fsm.updateIntervention(user, id, body);
  }

  @Patch('interventions/:id/status')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  status(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status: InterventionStatus; note?: string },
  ) {
    return this.fsm.updateInterventionStatus(user, id, body.status, body.note);
  }

  @Delete('interventions/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteIntervention(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.deleteIntervention(user, id);
  }

  // --- INTERVENTION NOTES ---

  @Post('interventions/:id/notes')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  createNote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { body: string; isInternal?: boolean },
  ) {
    return this.fsm.createInterventionNote(user, id, body);
  }

  @Delete('interventions/:id/notes/:noteId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  deleteNote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ) {
    return this.fsm.deleteInterventionNote(user, id, noteId);
  }

  @Post('interventions/:id/photos')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  addPhotos(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { fileKeys: string[] },
  ) {
    return this.fsm.addInterventionPhotos(user, id, body.fileKeys);
  }

  @Delete('interventions/:id/photos/:photoId')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  deletePhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    return this.fsm.deleteInterventionPhoto(user, id, photoId);
  }

  @Patch('interventions/:id/checklist')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  updateChecklist(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { progress: Record<string, boolean> },
  ) {
    return this.fsm.updateChecklistProgress(user, id, body.progress);
  }

  // --- LEADS ---

  @Get('leads')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  listLeads(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: CompanyLeadStatus,
  ) {
    return this.leads.listLeads(user, status);
  }

  @Get('leads/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  getLead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.leads.getLead(user, id);
  }

  @Post('leads')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  createLead(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      contactName: string;
      contactPhone: string;
      contactEmail?: string;
      message?: string;
      address?: string;
      source?: 'PACKAGE_BOOKING' | 'MANUAL' | 'PHONE' | 'WEBSITE';
      categoryId?: string;
      scheduledAt?: string;
      notes?: string;
    },
  ) {
    return this.leads.createLead(user, body);
  }

  @Patch('leads/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  updateLead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      status?: CompanyLeadStatus;
      notes?: string | null;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string | null;
      address?: string | null;
      scheduledAt?: string | null;
    },
  ) {
    return this.leads.updateLead(user, id, body);
  }

  @Post('leads/:id/convert')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  convertLead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { mode: 'customer' | 'intervention' | 'estimate'; categoryId?: string; title?: string },
  ) {
    return this.leads.convertLead(user, id, body.mode, body);
  }

  // --- CALENDAR ---

  @Get('calendar')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  calendar(
    @CurrentUser() user: JwtPayload,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('board') board?: string,
  ) {
    if (board === '1' || board === 'true') {
      return this.fsm.calendarBoard(user, from, to);
    }
    return this.fsm.calendar(user, from, to);
  }

  // --- COMPANY SERVICES ---

  @Get('services')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  listServices(@CurrentUser() user: JwtPayload) {
    return this.fsm.listCompanyServices(user);
  }

  @Post('services')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  createService(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; defaultPrice: number; materialsCost?: number; vatRate?: number },
  ) {
    return this.fsm.createCompanyService(user, body);
  }

  @Patch('services/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  updateService(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; defaultPrice?: number; materialsCost?: number | null; vatRate?: number | null },
  ) {
    return this.fsm.updateCompanyService(user, id, body);
  }

  @Delete('services/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('PRO', 'BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteService(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.deleteCompanyService(user, id);
  }

  // --- QUOTES ---

  @Get('quotes')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  quotes(@CurrentUser() user: JwtPayload) {
    return this.fsm.listQuotes(user);
  }

  @Get('quotes/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  quote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.getQuote(user, id);
  }

  @Post('quotes')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  createQuote(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      customerId: string;
      interventionId?: string;
      validUntil?: string;
      lines: { description: string; qty: number; unitPrice: number; vatRate?: number; companyServiceId?: string }[];
    },
  ) {
    return this.fsm.createQuote(user, body);
  }

  @Patch('quotes/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  updateQuote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      status?: QuoteStatus;
      validUntil?: string | null;
      lines?: { description: string; qty: number; unitPrice: number; vatRate?: number; companyServiceId?: string }[];
    },
  ) {
    return this.fsm.updateQuote(user, id, body);
  }

  @Delete('quotes/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteQuote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.deleteQuote(user, id);
  }

  @Post('quotes/:id/convert')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  convertQuote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.convertQuoteToIntervention(user, id);
  }

  @Post('quotes/:id/send')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  sendQuote(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.sendQuote(user, id);
  }

  @Get('quotes/:id/pdf')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  async quotePdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.fsm.getQuotePdf(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  // --- INVOICES ---

  @Get('invoices')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  invoices(@CurrentUser() user: JwtPayload) {
    return this.fsm.listInvoices(user);
  }

  @Get('invoices/:id/pdf')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  async invoicePdf(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.fsm.getInvoicePdf(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get('invoices/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  invoice(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.getInvoice(user, id);
  }

  @Post('invoices')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  createInvoice(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      interventionId: string;
      tvaRate?: number;
      dueDate?: string;
    },
  ) {
    return this.fsm.createInvoice(user, body);
  }

  @Patch('invoices/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  updateInvoice(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      paymentStatus?: InvoicePaymentStatus;
      dueDate?: string | null;
    },
  ) {
    return this.fsm.updateInvoice(user, id, body);
  }

  @Delete('invoices/:id')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  deleteInvoice(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.fsm.deleteInvoice(user, id);
  }

  @Get('export/invoices.csv')
  @UseGuards(CompanyGuard, SubscriptionGuard)
  @RequiresPlan('BUSINESS')
  @CompanyRoles('OWNER', 'MANAGER')
  async exportInvoicesCsv(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const { csv, filename } = await this.fsm.exportInvoicesCsv(user);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(csv);
  }
}
