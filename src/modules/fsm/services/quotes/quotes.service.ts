import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, QuoteStatus } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { CompanyAuthorizationService } from '../../../companies/authorization/company-authorization.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EmailService } from '../../../email/email.service';
import { QuotePdfService } from '../../pdf/quote-pdf.service';
import { FsmContextService } from '../../context/fsm-context.service';
import { nextCompanyNumber } from '../../../../common/utils/sequence-number.util';
import { RLS_SYSTEM_CONTEXT } from '../../../../common/rls/rls-system.util';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
    private readonly companyAuth: CompanyAuthorizationService,
    private readonly quotePdf: QuotePdfService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  list(user: JwtPayload, cursor?: string, limit = 25) {
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.quote.findMany({
      where: { companyId: this.ctx.companyId(user) },
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        validUntil: true,
        createdAt: true,
        customer: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take,
    }).then((items) => {
      if (!cursor) {
        return items as any;
      }
      return {
        items,
        nextCursor: items.length === take ? items[items.length - 1]?.id : null,
      };
    });
  }

  async get(user: JwtPayload, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: { customer: true, lines: { include: { companyService: true } }, intervention: true },
    });
    if (!quote) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return quote;
  }

  async create(
    user: JwtPayload,
    data: {
      customerId: string;
      interventionId?: string;
      validUntil?: string;
      lines: { description: string; qty: number; unitPrice: number; vatRate?: number; companyServiceId?: string }[];
    },
  ) {
    const cid = this.ctx.companyId(user);
    return await this.prisma.$transaction(async (tx) => {
      const number = await nextCompanyNumber(tx, {
        companyId: cid,
        namespace: 'quote-number',
        prefix: 'QTE',
        count: () => tx.quote.count({ where: { companyId: cid } }),
        exists: async (n) =>
          this.prisma.runOutsideRlsContext(() =>
            this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) => {
              const q = await db.quote.findUnique({
                where: { number: n },
                select: { id: true },
              });
              return q !== null;
            }),
          ),
      });

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

  async update(
    user: JwtPayload,
    id: string,
    data: {
      status?: QuoteStatus;
      validUntil?: string | null;
      lines?: { description: string; qty: number; unitPrice: number; vatRate?: number; companyServiceId?: string }[];
    },
  ) {
    const existing = await this.prisma.quote.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    return this.prisma.$transaction(async (tx) => {
      let total = existing.total;

      if (data.lines) {
        await tx.quoteLine.deleteMany({ where: { quoteId: id } });
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

  async delete(user: JwtPayload, id: string) {
    const existing = await this.prisma.quote.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing.status === 'CONVERTED') {
      throw AppErrors.badRequest('Cannot delete already converted quotes.');
    }

    await this.prisma.quote.delete({ where: { id } });
    return { success: true };
  }

  async convertToIntervention(user: JwtPayload, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: { customer: true, lines: true },
    });
    if (!quote) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (quote.status === 'CONVERTED') {
      throw AppErrors.badRequest('Quote is already converted to an intervention.');
    }

    await this.companyAuth.assertInterventionMonthlyLimit(quote.companyId);

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.intervention.count({ where: { companyId: quote.companyId } });
      let number = `INT-${String(count + 1).padStart(5, '0')}`;
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 15) {
        const existing = await this.prisma.runOutsideRlsContext(() =>
          this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) =>
            db.intervention.findUnique({
              where: { number },
              select: { id: true },
            }),
          ),
        );
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

  async send(user: JwtPayload, id: string) {
    this.ctx.assertNotTechnician(user);
    const quote = await this.prisma.quote.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
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

  async getPdf(user: JwtPayload, id: string) {
    this.ctx.assertNotTechnician(user);
    const quote = await this.prisma.quote.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
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
}
