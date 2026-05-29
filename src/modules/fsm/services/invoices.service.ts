import { Injectable, Logger } from '@nestjs/common';
import { FileVisibility, InvoicePaymentStatus, Prisma } from '@prisma/client';
import type { Readable } from 'stream';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { StorageService } from '../../files/services/storage.service';
import { EmailService } from '../../email/email.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { InvoicePdfService } from '../pdf/invoice-pdf.service';
import { paymentStatusRoLabel } from '../pdf/pdf-format.util';
import { FsmContextService } from '../context/fsm-context.service';
import { assertPaymentTransition } from '../utils/status-transitions';

async function streamToBuffer(stream: Readable | NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else if (chunk instanceof Buffer) {
      chunks.push(chunk);
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks);
}

/** Deterministic 32-bit hash for advisory-lock keys (uniform across replicas). */
function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
  ) {}

  /** Per-company advisory-lock key for serializing invoice number issuance. */
  private companyInvoiceLockKey(companyId: string): bigint {
    // Prefix with a stable namespace so this never collides with other locks.
    return BigInt(fnv1a32(`invoice-number::${companyId}`));
  }

  list(user: JwtPayload, cursor?: string, limit = 25, status?: InvoicePaymentStatus) {
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.companyInvoice.findMany({
      where: {
        companyId: this.ctx.companyId(user),
        ...(status ? { paymentStatus: status } : {}),
      },
      select: {
        id: true,
        number: true,
        amount: true,
        tvaAmount: true,
        paymentStatus: true,
        dueDate: true,
        issuedAt: true,
        intervention: {
          select: {
            id: true,
            number: true,
            description: true,
            status: true,
            customer: { select: { id: true, fullName: true, phone: true } },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
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
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: { intervention: { include: { customer: true } } },
    });
    if (!invoice) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    return invoice;
  }

  async create(
    user: JwtPayload,
    data: {
      interventionId: string;
      tvaRate?: number;
      dueDate?: string;
    },
  ) {
    const cid = this.ctx.companyId(user);
    const intervention = await this.prisma.intervention.findFirst({
      where: { id: data.interventionId, companyId: cid },
      include: {
        estimateProject: true,
        quotes: {
          include: { lines: true },
        },
      },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const company = await this.prisma.company.findUnique({ where: { id: cid } });

    let tvaRate = data.tvaRate;
    if (tvaRate === undefined) {
      if (intervention.estimateProject) {
        tvaRate = intervention.estimateProject.tvaRate !== null ? Number(intervention.estimateProject.tvaRate) : undefined;
      } else if (intervention.quotes.length > 0) {
        const quoteWithVat = intervention.quotes.find(q => q.lines.some(l => l.vatRate !== null));
        if (quoteWithVat) {
          const firstLineVat = quoteWithVat.lines.find(l => l.vatRate !== null)?.vatRate;
          tvaRate = firstLineVat !== null && firstLineVat !== undefined ? Number(firstLineVat) : undefined;
        }
      }
      if (tvaRate === undefined) {
        tvaRate = company?.isTvaPayer ? 20 : 0;
      }
    }

    const price = intervention.finalPrice || intervention.estimatedPrice || new Prisma.Decimal(0);
    const tvaAmount = new Prisma.Decimal(tvaRate > 0 ? Number(price) * (tvaRate / 100) : 0);

    return this.prisma.$transaction(async (tx) => {
      // P2.#6 — serialize invoice-number issuance per company. Without the
      // advisory lock, two concurrent create() calls could both read count=N
      // and then race on `INV-{N+1}`, falling back to the unique-constraint
      // retry loop. With the lock, the second caller blocks until the first
      // commits, so the count is always fresh.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${this.companyInvoiceLockKey(cid)}::bigint)`;

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

  async update(
    user: JwtPayload,
    id: string,
    data: {
      paymentStatus?: InvoicePaymentStatus;
      dueDate?: string | null;
      /**
       * Required when reversing a PAID invoice back to UNPAID (e.g. bounced
       * payment, clerical error). Stored on the linked intervention's status
       * history for audit.
       */
      paymentReversalReason?: string;
    },
  ) {
    const existing = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const isReversal =
      data.paymentStatus === 'UNPAID' && existing.paymentStatus === 'PAID';

    if (data.paymentStatus && data.paymentStatus !== existing.paymentStatus) {
      try {
        assertPaymentTransition(existing.paymentStatus, data.paymentStatus);
      } catch {
        throw AppErrors.badRequest(AppErrorMessages.STATUS_TRANSITION_INVALID);
      }
      if (isReversal && !data.paymentReversalReason?.trim()) {
        throw AppErrors.badRequest('Reversing a paid invoice requires a reason.');
      }
    }

    // Invalidate cached PDF when any document-visible field changes.
    const statusChanged =
      data.paymentStatus !== undefined && data.paymentStatus !== existing.paymentStatus;
    const dueDateChanged =
      data.dueDate !== undefined &&
      (data.dueDate === null
        ? existing.dueDate !== null
        : !existing.dueDate ||
          new Date(data.dueDate).getTime() !== existing.dueDate.getTime());
    const invalidatePdfCache = statusChanged || dueDateChanged;

    const updated = await this.prisma.companyInvoice.update({
      where: { id },
      data: {
        paymentStatus: data.paymentStatus,
        dueDate: data.dueDate === null ? null : data.dueDate ? new Date(data.dueDate) : undefined,
        ...(invalidatePdfCache ? { pdfFileKey: null } : {}),
      },
    });

    if (invalidatePdfCache && existing.pdfFileKey) {
      void this.storage
        .deleteByStoredPath(existing.pdfFileKey)
        .catch((err) =>
          this.logger.warn(
            `Failed to delete stale PDF cache ${existing.pdfFileKey}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

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

    // Reversal: PAID → UNPAID. Walk the intervention back from PAID → INVOICED
    // so the workflow accurately reflects that the invoice is again outstanding.
    if (isReversal && existing.interventionId) {
      const intervention = await this.prisma.intervention.findUnique({
        where: { id: existing.interventionId },
      });
      if (intervention && intervention.status === 'PAID') {
        await this.prisma.$transaction(async (tx) => {
          await tx.intervention.update({
            where: { id: existing.interventionId! },
            data: { status: 'INVOICED' },
          });
          if (user.memberId) {
            await tx.interventionStatusHistory.create({
              data: {
                interventionId: existing.interventionId!,
                fromStatus: 'PAID',
                toStatus: 'INVOICED',
                changedByMemberId: user.memberId,
                note: `Plată anulată pentru Factura ${existing.number}: ${data.paymentReversalReason?.trim()}`,
              },
            });
          }
        });
      }
    }

    return updated;
  }

  /**
   * P2.#3 — Cancel an invoice (UNPAID/OVERDUE → CANCELLED). Records the reason
   * and timestamp. Linked intervention rolls back to COMPLETED so it can be
   * re-invoiced if needed. PDF cache is invalidated so subsequent downloads
   * pick up the new title/watermark.
   */
  async cancel(user: JwtPayload, id: string, reason: string) {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw AppErrors.badRequest('Cancellation requires a reason.');
    }

    const existing = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    try {
      assertPaymentTransition(existing.paymentStatus, 'CANCELLED');
    } catch {
      throw AppErrors.badRequest(AppErrorMessages.STATUS_TRANSITION_INVALID);
    }

    if (existing.pdfFileKey) {
      void this.storage
        .deleteByStoredPath(existing.pdfFileKey)
        .catch((err) =>
          this.logger.warn(
            `Failed to drop stale PDF for cancelled invoice: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyInvoice.update({
        where: { id },
        data: {
          paymentStatus: 'CANCELLED',
          cancellationReason: trimmedReason,
          cancelledAt: new Date(),
          pdfFileKey: null,
        },
      });

      // Mirror facade rollback (same logic as delete): intervention returns to
      // COMPLETED so the master can correct and re-issue.
      if (existing.interventionId) {
        const intervention = await tx.intervention.findUnique({
          where: { id: existing.interventionId },
        });
        if (intervention && intervention.status === 'INVOICED') {
          await tx.intervention.update({
            where: { id: existing.interventionId },
            data: { status: 'COMPLETED' },
          });
          if (user.memberId) {
            await tx.interventionStatusHistory.create({
              data: {
                interventionId: existing.interventionId,
                fromStatus: 'INVOICED',
                toStatus: 'COMPLETED',
                changedByMemberId: user.memberId,
                note: `Factura ${existing.number} anulată: ${trimmedReason}`,
              },
            });
          }
        }
      }

      return updated;
    });
  }

  /**
   * P2.#16 — Record a partial payment. Increments `paidAmount`. If the total
   * (paid_amount >= amount + tva_amount) is reached, auto-promotes to PAID
   * (and flows through the existing UNPAID → PAID logic for intervention sync).
   */
  async recordPayment(
    user: JwtPayload,
    id: string,
    data: { amount: number; note?: string },
  ) {
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      throw AppErrors.badRequest('Payment amount must be positive.');
    }

    const existing = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing.paymentStatus === 'CANCELLED' || existing.paymentStatus === 'PAID') {
      throw AppErrors.badRequest(
        `Cannot register a payment on a ${existing.paymentStatus.toLowerCase()} invoice.`,
      );
    }

    const total = Number(existing.amount) + Number(existing.tvaAmount);
    const previousPaid = Number(existing.paidAmount);
    const newPaid = Math.min(total, previousPaid + data.amount);
    const isFullyPaid = newPaid + 0.005 >= total; // tolerance for rounding

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyInvoice.update({
        where: { id },
        data: {
          paidAmount: new Prisma.Decimal(newPaid),
          ...(isFullyPaid
            ? { paymentStatus: 'PAID', pdfFileKey: null }
            : {}),
        },
      });

      // Mirror existing UNPAID→PAID flow: also flip the intervention.
      if (
        isFullyPaid &&
        existing.interventionId &&
        existing.paymentStatus !== 'PAID'
      ) {
        const intervention = await tx.intervention.findUnique({
          where: { id: existing.interventionId },
        });
        if (intervention && intervention.status !== 'PAID') {
          await tx.intervention.update({
            where: { id: existing.interventionId },
            data: { status: 'PAID' },
          });
          if (user.memberId) {
            await tx.interventionStatusHistory.create({
              data: {
                interventionId: existing.interventionId,
                fromStatus: intervention.status,
                toStatus: 'PAID',
                changedByMemberId: user.memberId,
                note: `Plată finalizată pentru Factura ${existing.number}${data.note ? `: ${data.note}` : ''}`,
              },
            });
          }
        }
      }

      // Status (and therefore the rendered PDF) changed — drop the cache.
      if (isFullyPaid && existing.pdfFileKey) {
        void this.storage
          .deleteByStoredPath(existing.pdfFileKey)
          .catch((err) =>
            this.logger.warn(
              `Failed to drop PDF cache after full payment: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }

      return updated;
    });
  }

  async delete(user: JwtPayload, id: string) {
    const existing = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing.paymentStatus === 'PAID') {
      throw AppErrors.badRequest('Cannot delete paid invoices.');
    }

    // Cached PDF goes away with the invoice. Fire-and-forget; the row delete
    // is the source of truth for "this invoice no longer exists".
    if (existing.pdfFileKey) {
      void this.storage
        .deleteByStoredPath(existing.pdfFileKey)
        .catch((err) =>
          this.logger.warn(
            `Failed to delete PDF cache on invoice delete: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    // Walk linked intervention back from INVOICED → COMPLETED so it doesn't
    // become a dangling status. Direct update (bypasses transition validation)
    // because INVOICED → COMPLETED is a system-level rollback, not a user
    // workflow action.
    await this.prisma.$transaction(async (tx) => {
      await tx.companyInvoice.delete({ where: { id } });

      if (existing.interventionId) {
        const intervention = await tx.intervention.findUnique({
          where: { id: existing.interventionId },
        });
        if (intervention && intervention.status === 'INVOICED') {
          await tx.intervention.update({
            where: { id: existing.interventionId },
            data: { status: 'COMPLETED' },
          });
          if (user.memberId) {
            await tx.interventionStatusHistory.create({
              data: {
                interventionId: existing.interventionId,
                fromStatus: 'INVOICED',
                toStatus: 'COMPLETED',
                changedByMemberId: user.memberId,
                note: `Factura ${existing.number} ștearsă — lucrarea revine la „Finalizată”.`,
              },
            });
          }
        }
      }
    });
    return { success: true };
  }

  async getPdf(user: JwtPayload, id: string) {
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
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

    const filename = `${invoice.number}.pdf`;

    // Try cached PDF first. Cache is invalidated by update() whenever
    // paymentStatus or dueDate change (the only document-visible fields).
    if (invoice.pdfFileKey) {
      try {
        const { stream } = await this.storage.openReadStream(invoice.pdfFileKey);
        const buffer = await streamToBuffer(stream);
        return { buffer, filename };
      } catch (err) {
        // Cached file missing/corrupted — fall through and regenerate.
        this.logger.warn(
          `Cached PDF unreadable for invoice ${invoice.id} (${invoice.pdfFileKey}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const buffer = await this.invoicePdf.build(invoice);

    // Upload to private storage and persist the key for next-call reuse.
    // Failures are logged but non-fatal — the caller still gets the PDF.
    try {
      const storedPath = await this.storage.uploadBuffer(
        FileVisibility.PRIVATE,
        `invoices/${invoice.id}.pdf`,
        buffer,
        'application/pdf',
      );
      await this.prisma.companyInvoice.update({
        where: { id: invoice.id },
        data: { pdfFileKey: storedPath },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to cache invoice PDF ${invoice.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { buffer, filename };
  }

  /**
   * P2.#17 — Send the invoice to the customer by email, with the PDF attached.
   * Re-uses the cached PDF via `getPdf` (which builds + caches on first call).
   */
  async sendByEmail(user: JwtPayload, id: string, customMessage?: string) {
    const invoice = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
      include: {
        company: { select: { name: true } },
        intervention: { include: { customer: true } },
      },
    });
    if (!invoice) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    const recipient = invoice.intervention?.customer?.email?.trim();
    if (!recipient) {
      throw AppErrors.badRequest('Customer has no email on file.');
    }

    const { buffer } = await this.getPdf(user, id);

    const ok = await this.email.sendInvoiceEmail({
      to: recipient,
      companyName: invoice.company.name,
      invoiceNumber: invoice.number,
      total: Number(invoice.amount) + Number(invoice.tvaAmount),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
      paymentStatus: invoice.paymentStatus,
      customMessage,
      pdfBuffer: buffer,
    });

    return { sent: ok, recipient };
  }

  async exportCsv(user: JwtPayload) {
    this.ctx.assertNotTechnician(user);
    const invoices = await this.prisma.companyInvoice.findMany({
      where: { companyId: this.ctx.companyId(user) },
      include: { intervention: { include: { customer: true } } },
      orderBy: { issuedAt: 'desc' },
    });

    const header = 'Număr,Client,Sumă bază,TVA,Total cu TVA,Status plată,Data emiterii,Scadență\n';
    const rows = invoices
      .map((inv) => {
        const customer = inv.intervention?.customer?.fullName ?? '';
        const base = Number(inv.amount);
        const tva = Number(inv.tvaAmount);
        return [
          inv.number,
          `"${customer.replace(/"/g, '""')}"`,
          base.toFixed(2),
          tva.toFixed(2),
          (base + tva).toFixed(2),
          paymentStatusRoLabel(inv.paymentStatus),
          inv.issuedAt.toISOString().slice(0, 10),
          inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : '',
        ].join(',');
      })
      .join('\n');

    return { csv: header + rows, filename: 'facturi-export.csv' };
  }
}
