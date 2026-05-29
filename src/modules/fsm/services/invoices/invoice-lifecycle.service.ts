import { Injectable, Logger } from '@nestjs/common';
import { InvoicePaymentStatus, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import { StorageService } from '../../../files/services/storage.service';
import { FsmContextService } from '../../context/fsm-context.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { assertPaymentTransition } from '../../utils/status-transitions';
import { reconcileEstimateProjectLifecycle } from '../../../estimates/utils/estimate-lifecycle.util';
import { InvoicePdfCacheService } from './invoice-pdf-cache.service';

@Injectable()
export class InvoiceLifecycleService {
  private readonly logger = new Logger(InvoiceLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
    private readonly pdfCache: InvoicePdfCacheService,
    private readonly storage: StorageService,
  ) {}

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
        invoice: true,
        quotes: {
          include: { lines: true },
        },
      },
    });
    if (!intervention) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (intervention.invoice) {
      throw AppErrors.conflict('Lucrarea are deja o factură emisă.');
    }
    if (intervention.status !== 'COMPLETED') {
      throw AppErrors.badRequest('Lucrarea trebuie finalizată înainte de facturare.');
    }

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
    if (Number(price) <= 0) {
      throw AppErrors.badRequest('Suma facturii este 0 — completați prețul final al lucrării înainte de facturare.');
    }
    const tvaAmount = new Prisma.Decimal(tvaRate > 0 ? Number(price) * (tvaRate / 100) : 0);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${this.pdfCache.companyInvoiceLockKey(cid)}::bigint)`;

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
          if (intervention.estimateProjectId) {
            await reconcileEstimateProjectLifecycle(tx, intervention.estimateProjectId);
          }
        });
      }
    }

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
          if (intervention.estimateProjectId) {
            await reconcileEstimateProjectLifecycle(tx, intervention.estimateProjectId);
          }
        });
      }
    }

    return updated;
  }

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
    const isFullyPaid = newPaid + 0.005 >= total;

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
          if (intervention.estimateProjectId) {
            await reconcileEstimateProjectLifecycle(tx, intervention.estimateProjectId);
          }
        }
      }

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

    if (existing.pdfFileKey) {
      void this.storage
        .deleteByStoredPath(existing.pdfFileKey)
        .catch((err) =>
          this.logger.warn(
            `Failed to delete PDF cache on invoice delete: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

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
}
