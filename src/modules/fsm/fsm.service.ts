import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InterventionStatus, InvoicePaymentStatus, Prisma, QuoteStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../common/errors';
import { normalizePhone } from '../../common/utils/phone.util';
import { PrismaService } from '../shared/database/prisma.service';
import { CompanyAuthorizationService } from '../companies/company-authorization.service';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { EmailService } from '../email/email.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { QuotePdfService } from './quote-pdf.service';
import {
  assertInterventionTransition,
  assertPaymentTransition,
  isTerminalInterventionStatus,
} from './status-transitions';

const technicianWithUser = {
  include: {
    user: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    },
  },
};

@Injectable()
export class FsmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly quotePdf: QuotePdfService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly companyAuth: CompanyAuthorizationService,
  ) {}

  private companyId(user: JwtPayload) {
    if (!user.activeCompanyId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_CONTEXT_REQUIRED);
    }
    return user.activeCompanyId;
  }

  // --- CUSTOMERS ---

  private isTechnician(user: JwtPayload) {
    return user.companyRole === 'MEMBER';
  }

  private technicianInterventionFilter(user: JwtPayload): Prisma.InterventionWhereInput {
    return this.isTechnician(user) && user.memberId
      ? { technicianId: user.memberId }
      : {};
  }

  private async resolveAssignableTechnicianId(
    companyId: string,
    technicianId?: string | null,
  ): Promise<string | undefined> {
    if (!technicianId) return undefined;

    const member = await this.prisma.companyMember.findFirst({
      where: {
        id: technicianId,
        companyId,
        status: 'ACTIVE',
        role: 'MEMBER',
      },
      select: { id: true },
    });

    if (!member) {
      throw AppErrors.badRequest(AppErrorMessages.INTERVENTION_INVALID_TECHNICIAN);
    }

    return member.id;
  }

  listCustomers(user: JwtPayload) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    return this.prisma.companyCustomer.findMany({
      where: { companyId: this.companyId(user) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCustomer(user: JwtPayload, id: string) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const customer = await this.prisma.companyCustomer.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: {
        interventions: {
          orderBy: { createdAt: 'desc' },
          include: { technician: technicianWithUser },
        },
        quotes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return customer;
  }

  createCustomer(
    user: JwtPayload,
    data: { fullName: string; phone: string; email?: string; address: string; notes?: string },
  ) {
    const normalizedPhone = normalizePhone(data.phone) ?? data.phone.trim();
    return this.prisma.companyCustomer.create({
      data: {
        companyId: this.companyId(user),
        fullName: data.fullName.trim(),
        phone: normalizedPhone,
        email: data.email?.trim().toLowerCase(),
        address: data.address.trim(),
        notes: data.notes?.trim(),
      },
    });
  }

  async updateCustomer(
    user: JwtPayload,
    id: string,
    data: { fullName?: string; phone?: string; email?: string; address?: string; notes?: string },
  ) {
    const existing = await this.prisma.companyCustomer.findFirst({
      where: { id, companyId: this.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.companyCustomer.update({
      where: { id },
      data: {
        fullName: data.fullName?.trim(),
        phone: data.phone ? normalizePhone(data.phone) ?? data.phone.trim() : undefined,
        email: data.email?.trim().toLowerCase(),
        address: data.address?.trim(),
        notes: data.notes?.trim(),
      },
    });
  }

  async deleteCustomer(user: JwtPayload, id: string) {
    const existing = await this.prisma.companyCustomer.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: {
        _count: {
          select: { interventions: true, quotes: true },
        },
      },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing._count.interventions > 0 || existing._count.quotes > 0) {
      throw AppErrors.badRequest(
        'Cannot delete customer with active interventions or quotes.',
      );
    }

    await this.prisma.companyCustomer.delete({ where: { id } });
    return { success: true };
  }

  // --- INTERVENTIONS ---

  listInterventions(
    user: JwtPayload,
    filters?: { status?: InterventionStatus; customerId?: string; technicianId?: string },
  ) {
    const where: Prisma.InterventionWhereInput = {
      companyId: this.companyId(user),
      ...this.technicianInterventionFilter(user),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.customerId ? { customerId: filters.customerId } : {}),
      ...(filters?.technicianId ? { technicianId: filters.technicianId } : {}),
    };
    return this.prisma.intervention.findMany({
      where,
      include: { customer: true, technician: technicianWithUser },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getIntervention(user: JwtPayload, id: string) {
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        id,
        companyId: this.companyId(user),
        ...this.technicianInterventionFilter(user),
      },
      include: {
        customer: true,
        technician: technicianWithUser,
        notes: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              include: { user: { select: { firstName: true, lastName: true } } },
            },
          },
        },
        history: {
          orderBy: { changedAt: 'desc' },
          include: {
            changedBy: {
              include: { user: { select: { firstName: true, lastName: true } } },
            },
          },
        },
        quotes: true,
        invoice: true,
        photos: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return intervention;
  }

  async createIntervention(
    user: JwtPayload,
    data: {
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
    const cid = this.companyId(user);
    await this.companyAuth.assertInterventionMonthlyLimit(cid);
    const technicianId = await this.resolveAssignableTechnicianId(cid, data.technicianId);

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.intervention.count({
        where: { companyId: cid },
      });

      let number = `INT-${String(count + 1).padStart(5, '0')}`;
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 15) {
        const existing = await tx.intervention.findUnique({
          where: { number },
        });
        if (!existing) {
          isUnique = true;
        } else {
          attempts++;
          number = `INT-${String(count + 1 + attempts).padStart(5, '0')}`;
        }
      }

      const intervention = await tx.intervention.create({
        data: {
          companyId: cid,
          customerId: data.customerId,
          technicianId,
          number,
          type: data.type,
          description: data.description,
          address: data.address,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
          estimatedPrice: data.estimatedPrice,
          internalNotes: data.internalNotes,
        },
      });

      if (user.memberId) {
        await tx.interventionStatusHistory.create({
          data: {
            interventionId: intervention.id,
            toStatus: 'NEW',
            changedByMemberId: user.memberId,
            note: 'Lucrare creată',
          },
        });
      }
      return intervention;
    });
  }

  async updateIntervention(
    user: JwtPayload,
    id: string,
    data: {
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
    const existing = await this.prisma.intervention.findFirst({
      where: {
        id,
        companyId: this.companyId(user),
        ...this.technicianInterventionFilter(user),
      },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (this.isTechnician(user)) {
      const updateData: Prisma.InterventionUpdateInput = {
        description: data.description,
        address: data.address,
        finalPrice: data.finalPrice === null ? null : data.finalPrice,
      };
      return this.prisma.intervention.update({
        where: { id },
        data: updateData,
      });
    }

    const cid = this.companyId(user);
    let technicianUpdate: Prisma.InterventionUpdateInput['technician'] = undefined;
    if (data.technicianId === null) {
      technicianUpdate = { disconnect: true };
    } else if (data.technicianId) {
      const resolvedTechnicianId = await this.resolveAssignableTechnicianId(cid, data.technicianId);
      technicianUpdate = { connect: { id: resolvedTechnicianId! } };
    }

    // Handle clearing technicianId or scheduledAt if explicitly passed as null/undefined
    const updateData: Prisma.InterventionUpdateInput = {
      type: data.type,
      description: data.description,
      address: data.address,
      technician: technicianUpdate,
      scheduledAt: data.scheduledAt === null ? null : data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      estimatedPrice: data.estimatedPrice === null ? null : data.estimatedPrice,
      finalPrice: data.finalPrice === null ? null : data.finalPrice,
      internalNotes: data.internalNotes === null ? null : data.internalNotes,
    };

    return this.prisma.intervention.update({
      where: { id },
      data: updateData,
    });
  }

  async updateInterventionStatus(
    user: JwtPayload,
    id: string,
    toStatus: InterventionStatus,
    note?: string,
  ) {
    const existing = await this.prisma.intervention.findFirst({
      where: {
        id,
        companyId: this.companyId(user),
        ...this.technicianInterventionFilter(user),
      },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (isTerminalInterventionStatus(existing.status)) {
      throw AppErrors.badRequest(AppErrorMessages.STATUS_LOCKED);
    }

    try {
      assertInterventionTransition(existing.status, toStatus, user.companyRole);
    } catch {
      throw AppErrors.badRequest(AppErrorMessages.STATUS_TRANSITION_INVALID);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.intervention.update({
        where: { id },
        data: { status: toStatus },
      });
      if (user.memberId) {
        await tx.interventionStatusHistory.create({
          data: {
            interventionId: id,
            fromStatus: existing.status,
            toStatus,
            changedByMemberId: user.memberId,
            note: note?.trim() || `Status schimbat în ${toStatus}`,
          },
        });
      }
      return updated;
    });
  }

  async deleteIntervention(user: JwtPayload, id: string) {
    const existing = await this.prisma.intervention.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: { invoice: true },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing.status === 'COMPLETED' || existing.status === 'INVOICED' || existing.invoice) {
      throw AppErrors.badRequest('Cannot delete completed or invoiced interventions.');
    }

    await this.prisma.intervention.delete({ where: { id } });
    return { success: true };
  }

  // --- NOTES ---

  async createInterventionNote(
    user: JwtPayload,
    interventionId: string,
    body: { body: string; isInternal?: boolean },
  ) {
    if (!user.memberId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        id: interventionId,
        companyId: this.companyId(user),
        ...this.technicianInterventionFilter(user),
      },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.interventionNote.create({
      data: {
        interventionId,
        authorMemberId: user.memberId,
        body: body.body,
        isInternal: body.isInternal ?? true,
      },
    });
  }

  async deleteInterventionNote(user: JwtPayload, interventionId: string, noteId: string) {
    const note = await this.prisma.interventionNote.findFirst({
      where: {
        id: noteId,
        interventionId,
        intervention: { companyId: this.companyId(user) },
      },
    });
    if (!note) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (user.companyRole !== 'OWNER' && user.companyRole !== 'MANAGER' && note.authorMemberId !== user.memberId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }

    await this.prisma.interventionNote.delete({ where: { id: noteId } });
    return { success: true };
  }

  // --- QUOTES ---

  listQuotes(user: JwtPayload) {
    return this.prisma.quote.findMany({
      where: { companyId: this.companyId(user) },
      include: { customer: true, lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getQuote(user: JwtPayload, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: { customer: true, lines: { include: { companyService: true } }, intervention: true },
    });
    if (!quote) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return quote;
  }

  async createQuote(
    user: JwtPayload,
    data: {
      customerId: string;
      interventionId?: string;
      validUntil?: string;
      lines: { description: string; qty: number; unitPrice: number; vatRate?: number; companyServiceId?: string }[];
    },
  ) {
    const cid = this.companyId(user);
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.quote.count({ where: { companyId: cid } });

      let number = `QTE-${String(count + 1).padStart(5, '0')}`;
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 15) {
        const existing = await tx.quote.findUnique({ where: { number } });
        if (!existing) {
          isUnique = true;
        } else {
          attempts++;
          number = `QTE-${String(count + 1 + attempts).padStart(5, '0')}`;
        }
      }

      const total = data.lines.reduce((acc, line) => acc + line.qty * line.unitPrice, 0);

      const quote = await tx.quote.create({
        data: {
          companyId: cid,
          customerId: data.customerId,
          interventionId: data.interventionId || undefined,
          number,
          total,
          validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
          lines: {
            create: data.lines.map((line) => ({
              description: line.description,
              qty: line.qty,
              unitPrice: line.unitPrice,
              vatRate: line.vatRate,
              companyServiceId: line.companyServiceId || undefined,
            })),
          },
        },
        include: { lines: true },
      });

      return quote;
    });
  }

  async updateQuote(
    user: JwtPayload,
    id: string,
    data: {
      status?: QuoteStatus;
      validUntil?: string | null;
      lines?: { description: string; qty: number; unitPrice: number; vatRate?: number; companyServiceId?: string }[];
    },
  ) {
    const existing = await this.prisma.quote.findFirst({
      where: { id, companyId: this.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.$transaction(async (tx) => {
      let total = existing.total;

      if (data.lines) {
        // Delete all old lines
        await tx.quoteLine.deleteMany({ where: { quoteId: id } });
        // Create new lines
        await tx.quoteLine.createMany({
          data: data.lines.map((l) => ({
            quoteId: id,
            description: l.description,
            qty: l.qty,
            unitPrice: l.unitPrice,
            vatRate: l.vatRate || null,
            companyServiceId: l.companyServiceId || null,
          })),
        });
        total = new Prisma.Decimal(
          data.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0),
        );
      }

      return tx.quote.update({
        where: { id },
        data: {
          status: data.status,
          validUntil: data.validUntil === null ? null : data.validUntil ? new Date(data.validUntil) : undefined,
          total,
        },
        include: { lines: true },
      });
    });
  }

  async deleteQuote(user: JwtPayload, id: string) {
    const existing = await this.prisma.quote.findFirst({
      where: { id, companyId: this.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing.status === 'CONVERTED') {
      throw AppErrors.badRequest('Cannot delete already converted quotes.');
    }

    await this.prisma.quote.delete({ where: { id } });
    return { success: true };
  }

  async convertQuoteToIntervention(user: JwtPayload, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: { customer: true, lines: true },
    });
    if (!quote) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (quote.status === 'CONVERTED') {
      throw AppErrors.badRequest('Quote is already converted to an intervention.');
    }

    await this.companyAuth.assertInterventionMonthlyLimit(quote.companyId);

    return this.prisma.$transaction(async (tx) => {
      // Create new intervention from quote
      const count = await tx.intervention.count({ where: { companyId: quote.companyId } });
      let number = `INT-${String(count + 1).padStart(5, '0')}`;
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 15) {
        const existing = await tx.intervention.findUnique({ where: { number } });
        if (!existing) isUnique = true;
        else {
          attempts++;
          number = `INT-${String(count + 1 + attempts).padStart(5, '0')}`;
        }
      }

      const intervention = await tx.intervention.create({
        data: {
          companyId: quote.companyId,
          customerId: quote.customerId,
          number,
          type: 'Intervenție din Ofertă',
          description: `Creată automat din Oferta ${quote.number}:\n` + quote.lines.map(l => `- ${l.description} x${l.qty}`).join('\n'),
          address: quote.customer.address,
          estimatedPrice: quote.total,
        },
      });

      // Update quote status to CONVERTED and link intervention
      await tx.quote.update({
        where: { id },
        data: { status: 'CONVERTED', interventionId: intervention.id },
      });

      if (user.memberId) {
        await tx.interventionStatusHistory.create({
          data: {
            interventionId: intervention.id,
            toStatus: 'NEW',
            changedByMemberId: user.memberId,
            note: `Creată din Oferta ${quote.number}`,
          },
        });
      }

      return intervention;
    });
  }

  // --- INVOICES ---

  listInvoices(user: JwtPayload) {
    return this.prisma.companyInvoice.findMany({
      where: { companyId: this.companyId(user) },
      include: { intervention: { include: { customer: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async getInvoice(user: JwtPayload, id: string) {
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: { intervention: { include: { customer: true } } },
    });
    if (!invoice) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return invoice;
  }

  async createInvoice(
    user: JwtPayload,
    data: {
      interventionId: string;
      tvaRate?: number;
      dueDate?: string;
    },
  ) {
    const cid = this.companyId(user);
    const intervention = await this.prisma.intervention.findFirst({
      where: { id: data.interventionId, companyId: cid },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const price = intervention.finalPrice || intervention.estimatedPrice || new Prisma.Decimal(0);
    const tvaRate = data.tvaRate ?? 20; // Default 20% in Moldova
    const tvaAmount = new Prisma.Decimal(Number(price) * (tvaRate / 100));

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.companyInvoice.count({ where: { companyId: cid } });

      let number = `INV-${String(count + 1).padStart(5, '0')}`;
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 15) {
        const existing = await tx.companyInvoice.findUnique({ where: { number } });
        if (!existing) isUnique = true;
        else {
          attempts++;
          number = `INV-${String(count + 1 + attempts).padStart(5, '0')}`;
        }
      }

      const invoice = await tx.companyInvoice.create({
        data: {
          companyId: cid,
          interventionId: data.interventionId,
          number,
          amount: price,
          tvaRate,
          tvaAmount,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        },
      });

      // Auto update intervention status to INVOICED
      await tx.intervention.update({
        where: { id: data.interventionId },
        data: { status: 'INVOICED' },
      });

      if (user.memberId) {
        await tx.interventionStatusHistory.create({
          data: {
            interventionId: data.interventionId,
            fromStatus: intervention.status,
            toStatus: 'INVOICED',
            changedByMemberId: user.memberId,
            note: `Facturată cu nr. ${number}`,
          },
        });
      }

      return invoice;
    });
  }

  async updateInvoice(
    user: JwtPayload,
    id: string,
    data: {
      paymentStatus?: InvoicePaymentStatus;
      dueDate?: string | null;
    },
  ) {
    const existing = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (data.paymentStatus && data.paymentStatus !== existing.paymentStatus) {
      try {
        assertPaymentTransition(existing.paymentStatus, data.paymentStatus);
      } catch {
        throw AppErrors.badRequest(AppErrorMessages.STATUS_TRANSITION_INVALID);
      }
    }

    const updated = await this.prisma.companyInvoice.update({
      where: { id },
      data: {
        paymentStatus: data.paymentStatus,
        dueDate: data.dueDate === null ? null : data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });

    // If marked PAID and has intervention, log status update
    if (data.paymentStatus === 'PAID' && existing.interventionId && existing.paymentStatus !== 'PAID') {
      const intervention = await this.prisma.intervention.findUnique({
        where: { id: existing.interventionId },
      });
      if (intervention && intervention.status !== 'PAID') {
        await this.prisma.$transaction(async (tx) => {
          await tx.intervention.update({
            where: { id: existing.interventionId! },
            data: { status: 'PAID' },
          });
          if (user.memberId) {
            await tx.interventionStatusHistory.create({
              data: {
                interventionId: existing.interventionId!,
                fromStatus: intervention.status,
                toStatus: 'PAID',
                changedByMemberId: user.memberId,
                note: `Plată confirmată pentru Factura ${existing.number}`,
              },
            });
          }
        });
      }
    }

    return updated;
  }

  async deleteInvoice(user: JwtPayload, id: string) {
    const existing = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing.paymentStatus === 'PAID') {
      throw AppErrors.badRequest('Cannot delete paid invoices.');
    }

    await this.prisma.companyInvoice.delete({ where: { id } });
    return { success: true };
  }

  async getInvoicePdf(user: JwtPayload, id: string) {
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: {
        company: {
          select: {
            name: true,
            legalName: true,
            idno: true,
            legalAddress: true,
            contactPhone: true,
            contactEmail: true,
            isTvaPayer: true,
            tvaCode: true,
          },
        },
        intervention: { include: { customer: true } },
      },
    });
    if (!invoice) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const buffer = await this.invoicePdf.build(invoice);
    return {
      buffer,
      filename: `${invoice.number}.pdf`,
    };
  }

  // --- CALENDAR ---

  async calendarBoard(user: JwtPayload, from: string, to: string) {
    const cid = this.companyId(user);
    const techFilter = this.technicianInterventionFilter(user);
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const [scheduled, unscheduled, openLeads] = await Promise.all([
      this.prisma.intervention.findMany({
        where: {
          companyId: cid,
          scheduledAt: { gte: fromDate, lte: toDate },
          ...techFilter,
        },
        include: { customer: true, technician: technicianWithUser },
        orderBy: { scheduledAt: 'asc' },
      }),
      this.prisma.intervention.findMany({
        where: {
          companyId: cid,
          scheduledAt: null,
          status: { in: ['NEW', 'SCHEDULED'] },
          ...techFilter,
        },
        include: { customer: true, technician: technicianWithUser },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.isTechnician(user)
        ? Promise.resolve([])
        : this.prisma.companyLead.findMany({
            where: { companyId: cid, status: { in: ['NEW', 'CONTACTED', 'QUALIFIED'] } },
            include: {
              category: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
          }),
    ]);

    return { scheduled, unscheduled, openLeads };
  }

  calendar(user: JwtPayload, from: string, to: string) {
    return this.prisma.intervention.findMany({
      where: {
        companyId: this.companyId(user),
        scheduledAt: { gte: new Date(from), lte: new Date(to) },
        ...this.technicianInterventionFilter(user),
      },
      include: { customer: true, technician: technicianWithUser },
    });
  }

  // --- CUSTOMER TIMELINE ---

  async getCustomerTimeline(user: JwtPayload, customerId: string) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const cid = this.companyId(user);
    const customer = await this.prisma.companyCustomer.findFirst({
      where: { id: customerId, companyId: cid },
    });
    if (!customer) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const [interventions, quotes, estimates, invoices, leads, notes] = await Promise.all([
      this.prisma.intervention.findMany({
        where: { customerId, companyId: cid },
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, type: true, status: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.quote.findMany({
        where: { customerId, companyId: cid },
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, total: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.estimateProject.findMany({
        where: { customerId, companyId: cid },
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, title: true, status: true, grandTotal: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.companyInvoice.findMany({
        where: { companyId: cid, intervention: { customerId } },
        orderBy: { issuedAt: 'desc' },
        select: { id: true, number: true, amount: true, paymentStatus: true, issuedAt: true },
      }),
      this.prisma.companyLead.findMany({
        where: { companyId: cid, customerId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, contactName: true, status: true, source: true, packageTitle: true, createdAt: true },
      }),
      this.prisma.interventionNote.findMany({
        where: { intervention: { customerId, companyId: cid }, isInternal: false },
        orderBy: { createdAt: 'desc' },
        select: { id: true, body: true, createdAt: true, interventionId: true },
      }),
    ]);

    type TimelineItem = {
      id: string;
      type: string;
      title: string;
      subtitle?: string;
      status?: string;
      at: string;
      meta?: Record<string, unknown>;
    };

    const items: TimelineItem[] = [];

    for (const i of interventions) {
      items.push({
        id: i.id,
        type: 'intervention',
        title: `${i.number} · ${i.type}`,
        status: i.status,
        at: i.updatedAt.toISOString(),
        meta: { interventionId: i.id },
      });
    }
    for (const q of quotes) {
      items.push({
        id: q.id,
        type: 'quote',
        title: `Deviz ${q.number}`,
        subtitle: `${Number(q.total).toLocaleString('ro-MD')} MDL`,
        status: q.status,
        at: q.updatedAt.toISOString(),
        meta: { quoteId: q.id },
      });
    }
    for (const e of estimates) {
      items.push({
        id: e.id,
        type: 'estimate',
        title: `Smetă ${e.number} — ${e.title}`,
        subtitle: `${Number(e.grandTotal).toLocaleString('ro-MD')} MDL`,
        status: e.status,
        at: e.updatedAt.toISOString(),
        meta: { estimateId: e.id },
      });
    }
    for (const inv of invoices) {
      items.push({
        id: inv.id,
        type: 'invoice',
        title: `Factură ${inv.number}`,
        subtitle: `${Number(inv.amount).toLocaleString('ro-MD')} MDL`,
        status: inv.paymentStatus,
        at: inv.issuedAt.toISOString(),
        meta: { invoiceId: inv.id },
      });
    }
    for (const l of leads) {
      items.push({
        id: l.id,
        type: 'lead',
        title: l.packageTitle ?? l.contactName,
        status: l.status,
        at: l.createdAt.toISOString(),
        meta: { leadId: l.id, source: l.source },
      });
    }
    for (const n of notes) {
      items.push({
        id: n.id,
        type: 'note',
        title: n.body.slice(0, 120),
        at: n.createdAt.toISOString(),
        meta: { interventionId: n.interventionId },
      });
    }

    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return { customer, items };
  }

  // --- COMPANY SERVICES (rate book) ---

  listCompanyServices(user: JwtPayload) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    return this.prisma.companyService.findMany({
      where: { companyId: this.companyId(user) },
      orderBy: { name: 'asc' },
    });
  }

  createCompanyService(
    user: JwtPayload,
    data: { name: string; defaultPrice: number; materialsCost?: number; vatRate?: number },
  ) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    return this.prisma.companyService.create({
      data: {
        companyId: this.companyId(user),
        name: data.name.trim(),
        defaultPrice: data.defaultPrice,
        materialsCost: data.materialsCost,
        vatRate: data.vatRate,
      },
    });
  }

  async updateCompanyService(
    user: JwtPayload,
    id: string,
    data: { name?: string; defaultPrice?: number; materialsCost?: number | null; vatRate?: number | null },
  ) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const existing = await this.prisma.companyService.findFirst({
      where: { id, companyId: this.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.companyService.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        defaultPrice: data.defaultPrice,
        materialsCost: data.materialsCost === null ? null : data.materialsCost,
        vatRate: data.vatRate === null ? null : data.vatRate,
      },
    });
  }

  async deleteCompanyService(user: JwtPayload, id: string) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const existing = await this.prisma.companyService.findFirst({
      where: { id, companyId: this.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    await this.prisma.companyService.delete({ where: { id } });
    return { success: true };
  }

  // --- INTERVENTION PHOTOS ---

  async addInterventionPhotos(user: JwtPayload, interventionId: string, fileKeys: string[]) {
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        id: interventionId,
        companyId: this.companyId(user),
        ...this.technicianInterventionFilter(user),
      },
      include: { photos: true },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const startOrder = intervention.photos.length;
    await this.prisma.interventionPhoto.createMany({
      data: fileKeys.map((fileKey, index) => ({
        interventionId,
        fileKey,
        sortOrder: startOrder + index,
      })),
    });

    return this.prisma.interventionPhoto.findMany({
      where: { interventionId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async deleteInterventionPhoto(user: JwtPayload, interventionId: string, photoId: string) {
    const photo = await this.prisma.interventionPhoto.findFirst({
      where: {
        id: photoId,
        interventionId,
        intervention: {
          companyId: this.companyId(user),
          ...this.technicianInterventionFilter(user),
        },
      },
    });
    if (!photo) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    await this.prisma.interventionPhoto.delete({ where: { id: photoId } });
    return { success: true };
  }

  async updateChecklistProgress(
    user: JwtPayload,
    interventionId: string,
    progress: Record<string, boolean>,
  ) {
    const intervention = await this.prisma.intervention.findFirst({
      where: {
        id: interventionId,
        companyId: this.companyId(user),
        ...this.technicianInterventionFilter(user),
      },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.intervention.update({
      where: { id: interventionId },
      data: { checklistProgress: progress },
    });
  }

  // --- QUOTE SEND & PDF ---

  async sendQuote(user: JwtPayload, id: string) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const quote = await this.prisma.quote.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: {
        customer: true,
        lines: true,
        company: {
          select: { name: true, contactEmail: true },
        },
      },
    });
    if (!quote) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (quote.status === 'CONVERTED') {
      throw AppErrors.badRequest('Devizul a fost deja convertit.');
    }

    const updated = await this.prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.SENT },
      include: { customer: true, lines: true },
    });

    const frontendUrl = this.config.get<string>('frontendUrl') || 'http://localhost:5174';
    const portalUrl = `${frontendUrl}/portal/oferte`;

    if (quote.customer.email) {
      void this.email.sendQuoteEmail({
        to: quote.customer.email,
        companyName: quote.company.name,
        quoteNumber: quote.number,
        total: Number(quote.total),
        portalUrl,
      });
    }

    return { quote: updated, emailSent: !!quote.customer.email };
  }

  async getQuotePdf(user: JwtPayload, id: string) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const quote = await this.prisma.quote.findFirst({
      where: { id, companyId: this.companyId(user) },
      include: {
        customer: true,
        lines: true,
        company: {
          select: {
            name: true,
            legalName: true,
            idno: true,
            legalAddress: true,
            contactPhone: true,
            contactEmail: true,
            isTvaPayer: true,
            tvaCode: true,
          },
        },
      },
    });
    if (!quote) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const buffer = await this.quotePdf.build(quote);
    return { buffer, filename: `${quote.number}.pdf` };
  }

  async exportInvoicesCsv(user: JwtPayload) {
    if (this.isTechnician(user)) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    const invoices = await this.prisma.companyInvoice.findMany({
      where: { companyId: this.companyId(user) },
      include: { intervention: { include: { customer: true } } },
      orderBy: { issuedAt: 'desc' },
    });

    const header = 'Număr,Client,Sumă,TVA,Status plată,Data emiterii,Scadență\n';
    const rows = invoices
      .map((inv) => {
        const customer = inv.intervention?.customer?.fullName ?? '';
        return [
          inv.number,
          `"${customer.replace(/"/g, '""')}"`,
          Number(inv.amount).toFixed(2),
          Number(inv.tvaAmount).toFixed(2),
          inv.paymentStatus,
          inv.issuedAt.toISOString().slice(0, 10),
          inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : '',
        ].join(',');
      })
      .join('\n');

    return { csv: header + rows, filename: 'facturi-export.csv' };
  }
}
