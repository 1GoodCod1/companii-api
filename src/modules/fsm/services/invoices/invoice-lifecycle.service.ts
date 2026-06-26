import { Injectable, Logger } from '@nestjs/common';
import { InvoicePaymentStatus, NotificationCategory, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { StorageService } from '../../../files/services/storage.service';
import { FsmContextService } from '../../context/fsm-context.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { assertPaymentTransition } from '../../utils/status-transitions';
import { reconcileEstimateProjectLifecycle } from '../../../estimates/utils/project/estimate-lifecycle.util';
import { InvoicePdfCacheService } from './invoice-pdf-cache.service';
import { NotificationsSenderService } from '../../../notifications/services/notifications-sender.service';
import { notifyPortalClient } from '../../utils/notify-portal-client.util';
import { RLS_SYSTEM_CONTEXT } from '../../../../common/rls/rls-system.util';
import { nextCompanyNumber } from '../../../../common/utils/sequence-number.util';

@Injectable()
export class InvoiceLifecycleService {
  private readonly logger = new Logger(InvoiceLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FsmContextService,
    private readonly pdfCache: InvoicePdfCacheService,
    private readonly storage: StorageService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsSenderService,
  ) {}

  private notifyClientPaymentConfirmed(invoice: {
    number: string;
    interventionId: string | null;
  }): void {
    if (!invoice.interventionId) return;
    void notifyPortalClient(
      this.prisma,
      this.notifications,
      { interventionId: invoice.interventionId },
      {
        title: 'Plată confirmată',
        message: `Plata pentru factura #${invoice.number} a fost confirmată. Vă mulțumim!`,
        category: NotificationCategory.PAYMENT_SUCCESS,
        link: '/portal/facturi',
        i18nKey: 'paymentConfirmed',
        params: { number: invoice.number },
        meta: { invoiceNumber: invoice.number },
      },
    );
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

    const resolvedTvaRate: number = tvaRate;
    const price = intervention.finalPrice || intervention.estimatedPrice || new Prisma.Decimal(0);
    if (Number(price) <= 0) {
      throw AppErrors.badRequest('Suma facturii este 0 — completați prețul final al lucrării înainte de facturare.');
    }
    const tvaAmount = new Prisma.Decimal(
      resolvedTvaRate > 0 ? Number(price) * (resolvedTvaRate / 100) : 0,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const number = await nextCompanyNumber(tx, {
        companyId: cid,
        namespace: 'invoice-number',
        prefix: 'INV',
        count: (year) =>
          tx.companyInvoice.count({
            where: {
              companyId: cid,
              issuedAt: {
                gte: new Date(year, 0, 1),
                lt: new Date(year + 1, 0, 1),
              },
            },
          }),
        exists: async (n) =>
          this.prisma.runOutsideRlsContext(() =>
            this.prisma.withRlsContext(RLS_SYSTEM_CONTEXT, async (db) => {
              const inv = await db.companyInvoice.findUnique({
                where: { number: n },
                select: { id: true },
              });
              return inv !== null;
            }),
          ),
      });

      const invoice = await tx.companyInvoice.create({
        data: {
          companyId: cid,
          interventionId: data.interventionId,
          number,
          amount: price,
          tvaRate: resolvedTvaRate,
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

    await this.cache.invalidateAnalytics(cid);

    const total = Number(result.amount) + Number(result.tvaAmount);
    void notifyPortalClient(
      this.prisma,
      this.notifications,
      { interventionId: data.interventionId },
      {
        title: 'Factură nouă',
        message: `${company?.name ?? 'Compania'} v-a emis factura #${result.number} în valoare de ${total.toFixed(2)} MDL.`,
        category: NotificationCategory.INVOICE_ISSUED,
        link: '/portal/facturi',
        i18nKey: 'invoiceIssued',
        params: {
          companyName: company?.name ?? 'Compania',
          number: result.number,
          total: total.toFixed(2),
        },
        meta: { invoiceNumber: result.number, total },
      },
    );

    return result;
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
    const total = Number(existing.amount) + Number(existing.tvaAmount);
    const paidAmountUpdate =
      data.paymentStatus === 'PAID' && existing.paymentStatus !== 'PAID'
        ? { paidAmount: new Prisma.Decimal(total) }
        : isReversal
          ? { paidAmount: new Prisma.Decimal(0) }
          : {};

    const updated = await this.prisma.companyInvoice.update({
      where: { id },
      data: {
        paymentStatus: data.paymentStatus,
        dueDate: data.dueDate === null ? null : data.dueDate ? new Date(data.dueDate) : undefined,
        ...paidAmountUpdate,
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

    if (data.paymentStatus === 'PAID' && existing.paymentStatus !== 'PAID') {
      this.notifyClientPaymentConfirmed(existing);
    }

    await this.cache.invalidateAnalytics(this.ctx.companyId(user));

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

    const result = await this.prisma.$transaction(async (tx) => {
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

    await this.cache.invalidateAnalytics(this.ctx.companyId(user));

    return result;
  }

  async recordPayment(
    user: JwtPayload,
    id: string,
    data: { amount: number; note?: string; proofFileId?: string },
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
    if (existing.paymentStatus === 'PENDING_CONFIRMATION') {
      throw AppErrors.badRequest(
        'Clientul a trimis dovada plății — confirmați sau respingeți înainte de a înregistra o plată manuală.',
      );
    }

    const total = Number(existing.amount) + Number(existing.tvaAmount);
    const previousPaid = Number(existing.paidAmount);
    const newPaid = Math.min(total, previousPaid + data.amount);
    const isFullyPaid = newPaid + 0.005 >= total;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyInvoice.update({
        where: { id },
        data: {
          paidAmount: new Prisma.Decimal(newPaid),
          ...(isFullyPaid
            ? { paymentStatus: 'PAID', pdfFileKey: null }
            : {}),
          // Receipt attached by the company itself (not the client portal).
          ...(data.proofFileId
            ? {
                paymentProofFileKey: data.proofFileId,
                paymentProofConfirmedByMemberId: user.memberId ?? null,
                paymentProofConfirmedAt: new Date(),
              }
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

    if (isFullyPaid) {
      this.notifyClientPaymentConfirmed(existing);
    }

    await this.cache.invalidateAnalytics(this.ctx.companyId(user));

    return result;
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
    if (existing.paymentProofFileKey) {
      this.deletePaymentProofFile(existing.paymentProofFileKey);
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

    await this.cache.invalidateAnalytics(this.ctx.companyId(user));

    return { success: true };
  }

  async submitPaymentProof(params: {
    invoiceId: string;
    customerId: string;
    fileId: string;
    uploadedByUserId: string;
  }) {
    const file = await this.prisma.file.findUnique({ where: { id: params.fileId } });
    if (!file) throw AppErrors.notFound('Fișierul nu a fost găsit.');
    if (file.uploadedById && file.uploadedById !== params.uploadedByUserId) {
      throw AppErrors.forbidden('Nu puteți folosi acest fișier.');
    }

    const existing = await this.prisma.companyInvoice.findFirst({
      where: {
        id: params.invoiceId,
        intervention: { customerId: params.customerId },
      },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);

    if (existing.paymentStatus !== 'UNPAID' && existing.paymentStatus !== 'OVERDUE') {
      throw AppErrors.badRequest('Factura nu acceptă încărcarea dovezii în acest moment.');
    }

    try {
      assertPaymentTransition(existing.paymentStatus, 'PENDING_CONFIRMATION');
    } catch {
      throw AppErrors.badRequest(AppErrorMessages.STATUS_TRANSITION_INVALID);
    }

    const updated = await this.prisma.companyInvoice.update({
      where: { id: existing.id },
      data: {
        paymentStatus: 'PENDING_CONFIRMATION',
        paymentProofFileKey: params.fileId,
        paymentProofSubmittedAt: new Date(),
        paymentProofRejectedReason: null,
        paymentProofRejectedAt: null,
        pdfFileKey: null,
      },
    });

    await this.cache.invalidateAnalytics(existing.companyId);

    return updated;
  }

  async confirmPaymentProof(user: JwtPayload, id: string) {
    const existing = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (existing.paymentStatus !== 'PENDING_CONFIRMATION') {
      throw AppErrors.badRequest('Factura nu așteaptă confirmarea plății.');
    }
    if (!existing.paymentProofFileKey) {
      throw AppErrors.badRequest('Lipsește dovada plății.');
    }

    const total = Number(existing.amount) + Number(existing.tvaAmount);
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.companyInvoice.update({
        where: { id },
        data: {
          paymentStatus: 'PAID',
          paidAmount: new Prisma.Decimal(total),
          paymentProofConfirmedByMemberId: user.memberId ?? null,
          paymentProofConfirmedAt: now,
          pdfFileKey: null,
        },
      });

      if (existing.interventionId) {
        await this.promoteInterventionToPaid(
          tx,
          user,
          existing.interventionId,
          existing.number,
          `Plată confirmată (dovadă client) pentru Factura ${existing.number}`,
        );
      }

      return invoice;
    });

    if (existing.pdfFileKey) {
      void this.storage
        .deleteByStoredPath(existing.pdfFileKey)
        .catch((err) =>
          this.logger.warn(
            `Failed to delete stale PDF cache ${existing.pdfFileKey}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    this.notifyClientPaymentConfirmed(existing);

    await this.cache.invalidateAnalytics(existing.companyId);

    return updated;
  }

  async rejectPaymentProof(user: JwtPayload, id: string, reason: string) {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw AppErrors.badRequest('Respingerea necesită un motiv.');
    }

    const existing = await this.prisma.companyInvoice.findFirst({
      where: { id, companyId: this.ctx.companyId(user) },
    });
    if (!existing) throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    if (existing.paymentStatus !== 'PENDING_CONFIRMATION') {
      throw AppErrors.badRequest('Factura nu așteaptă confirmarea plății.');
    }

    const nextStatus = this.resolveStatusAfterRejection(existing);

    const updated = await this.prisma.companyInvoice.update({
      where: { id },
      data: {
        paymentStatus: nextStatus,
        paymentProofFileKey: null,
        paymentProofSubmittedAt: null,
        paymentProofRejectedReason: trimmedReason,
        paymentProofRejectedAt: new Date(),
        pdfFileKey: null,
      },
    });

    if (existing.paymentProofFileKey) {
      this.deletePaymentProofFile(existing.paymentProofFileKey);
    }

    await this.cache.invalidateAnalytics(existing.companyId);

    return updated;
  }
  
  private deletePaymentProofFile(fileId: string): void {
    void (async () => {
      const file = await this.prisma.file.findUnique({ where: { id: fileId } });
      if (!file) return;
      await this.storage.deleteByStoredPath(file.path);
      await this.prisma.file.delete({ where: { id: fileId } });
    })().catch((err) =>
      this.logger.warn(
        `Failed to delete orphaned payment proof ${fileId}: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  private resolveStatusAfterRejection(invoice: {
    dueDate: Date | null;
  }): 'UNPAID' | 'OVERDUE' {
    if (invoice.dueDate && invoice.dueDate.getTime() < Date.now()) {
      return 'OVERDUE';
    }
    return 'UNPAID';
  }

  private async promoteInterventionToPaid(
    tx: Prisma.TransactionClient,
    user: JwtPayload,
    interventionId: string,
    invoiceNumber: string,
    note: string,
  ): Promise<void> {
    const intervention = await tx.intervention.findUnique({
      where: { id: interventionId },
    });
    if (!intervention || intervention.status === 'PAID') return;

    await tx.intervention.update({
      where: { id: interventionId },
      data: { status: 'PAID' },
    });
    if (user.memberId) {
      await tx.interventionStatusHistory.create({
        data: {
          interventionId,
          fromStatus: intervention.status,
          toStatus: 'PAID',
          changedByMemberId: user.memberId,
          note,
        },
      });
    }
    if (intervention.estimateProjectId) {
      await reconcileEstimateProjectLifecycle(tx, intervention.estimateProjectId);
    }
  }
}
