/**
 * V-02 / V-03 / V-08 / V-14: receipts CRUD + reconciliation.
 *
 * Allowed project statuses for receipt CRUD (V-14):
 *   CALCULATED | APPROVED | SENT | ACCEPTED | IN_EXECUTION | DONE.
 * Disallowed: DRAFT, MEASURED, CANCELLED.
 *
 * File visibility (V-08): receipts files are PRIVATE and only readable
 * by OWNER/MANAGER of the owning company or the MEMBER who uploaded.
 */
import { Injectable } from '@nestjs/common';
import { EstimateLineActualStatus, EstimateProjectStatus, Prisma } from '@prisma/client';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import type { JwtPayload } from '../../auth/types/jwt-payload';
import { EstimatesContextService } from '../context/estimates-context.service';
import {
  RECEIPT_RECONCILIATION_MISMATCH,
  reconcileReceipt,
  type ReceiptLineInput,
} from '../utils/receipt-reconciliation.util';
import { EstimateProjectAccessService } from './estimate-project-access.service';

const RECEIPT_ALLOWED_STATUSES: ReadonlySet<EstimateProjectStatus> = new Set([
  EstimateProjectStatus.CALCULATED,
  EstimateProjectStatus.APPROVED,
  EstimateProjectStatus.SENT,
  EstimateProjectStatus.ACCEPTED,
  EstimateProjectStatus.IN_EXECUTION,
  EstimateProjectStatus.DONE,
]);

export type ReceiptLineUpdate = {
  lineId: string;
  actualUnitPrice: number;
  actualQty?: number;
  actualNotes?: string;
};

export type CreateReceiptInput = {
  fileKey?: string | null;
  store: string;
  totalAmount: number;
  purchaseDate: string;
  lineUpdates: ReceiptLineUpdate[];
};

@Injectable()
export class EstimateReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
  ) {}

  // V-02 + V-14: create receipt and attach to selected lines
  async create(user: JwtPayload, projectId: string, body: CreateReceiptInput) {
    const project = await this.access.findProjectOrThrow(user, projectId);
    this.assertProjectStatusAllowsReceipts(project.status);
    if (!user.memberId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    if (project.actualsLockedAt) {
      throw AppErrors.badRequest('Smeta a fost deja blocată ("lock-actuals"). Nu se mai pot adăuga chitanțe noi.');
    }

    const parsingRequired = !body.lineUpdates?.length || body.totalAmount <= 0;
    const lineUpdates = body.lineUpdates ?? [];

    if (!parsingRequired && lineUpdates.length > 0) {
      await this.reconcileOrThrow(projectId, lineUpdates, body.totalAmount);
    }

    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.estimateReceipt.create({
        data: {
          companyId: this.ctx.companyId(user),
          projectId,
          fileKey: body.fileKey ?? null,
          store: body.store.trim(),
          totalAmount: body.totalAmount,
          purchaseDate: new Date(body.purchaseDate),
          addedByMemberId: user.memberId!,
          parsingRequired,
        },
      });

      await this.applyLineUpdates(tx, projectId, receipt.id, lineUpdates, user.memberId!);

      return tx.estimateReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: { lines: true },
      });
    });
  }

  // V-02: edit a not-yet-verified receipt
  async update(
    user: JwtPayload,
    projectId: string,
    receiptId: string,
    body: Partial<CreateReceiptInput>,
  ) {
    const receipt = await this.findReceiptOrThrow(user, projectId, receiptId);
    if (receipt.verified) {
      throw AppErrors.badRequest('Chitanța a fost deja verificată și nu se mai poate edita.');
    }

    const lineUpdates = body.lineUpdates ?? [];
    const totalAmount = body.totalAmount ?? Number(receipt.totalAmount);

    if (lineUpdates.length > 0) {
      await this.reconcileOrThrow(projectId, lineUpdates, totalAmount);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.estimateReceipt.update({
        where: { id: receiptId },
        data: {
          fileKey: body.fileKey === undefined ? undefined : body.fileKey,
          store: body.store?.trim(),
          totalAmount: body.totalAmount,
          purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
          parsingRequired: lineUpdates.length > 0 ? false : undefined,
        },
      });

      if (lineUpdates.length > 0) {
        // Clear previous attachments for this receipt before re-applying.
        await tx.estimateLine.updateMany({
          where: { receiptId },
          data: {
            receiptId: null,
            actualUnitPrice: null,
            actualLineTotal: null,
            actualQty: null,
            actualNotes: null,
            actualStatus: EstimateLineActualStatus.PENDING,
            actualStatusUpdatedAt: null,
            actualStatusByMemberId: null,
          },
        });
        await this.applyLineUpdates(tx, projectId, receiptId, lineUpdates, user.memberId!);
      }

      return tx.estimateReceipt.findUniqueOrThrow({
        where: { id: updated.id },
        include: { lines: true },
      });
    });
  }

  // V-02: managers verify a receipt → locks editing
  async verify(user: JwtPayload, projectId: string, receiptId: string) {
    this.ctx.assertManagement(user);
    const receipt = await this.findReceiptOrThrow(user, projectId, receiptId);
    if (receipt.verified) return receipt;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.estimateReceipt.update({
        where: { id: receiptId },
        data: {
          verified: true,
          verifiedAt: new Date(),
          verifiedByMemberId: user.memberId,
        },
      });
      await tx.estimateLine.updateMany({
        where: { receiptId },
        data: {
          actualStatus: EstimateLineActualStatus.VERIFIED,
          actualStatusUpdatedAt: new Date(),
          actualStatusByMemberId: user.memberId,
        },
      });
      return updated;
    });
  }

  // V-14: bulk-action mark lines as NO_RECEIPT / SKIPPED
  async setLinesStatus(
    user: JwtPayload,
    projectId: string,
    body: { lineIds: string[]; status: 'NO_RECEIPT' | 'SKIPPED' },
  ) {
    const project = await this.access.findProjectOrThrow(user, projectId);
    this.assertProjectStatusAllowsReceipts(project.status);
    if (!user.memberId) {
      throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    }
    if (project.actualsLockedAt) {
      throw AppErrors.badRequest('Smeta a fost deja blocată.');
    }

    const lines = await this.prisma.estimateLine.findMany({
      where: { id: { in: body.lineIds }, stage: { projectId } },
      select: { id: true, qty: true, unitPrice: true },
    });

    return this.prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const qty = Number(line.qty);
        const unitPrice = Number(line.unitPrice);
        await tx.estimateLine.update({
          where: { id: line.id },
          data:
            body.status === 'NO_RECEIPT'
              ? {
                  actualStatus: EstimateLineActualStatus.NO_RECEIPT,
                  actualUnitPrice: unitPrice,
                  actualQty: qty,
                  actualLineTotal: round2(qty * unitPrice),
                  actualStatusUpdatedAt: new Date(),
                  actualStatusByMemberId: user.memberId,
                }
              : {
                  actualStatus: EstimateLineActualStatus.SKIPPED,
                  actualStatusUpdatedAt: new Date(),
                  actualStatusByMemberId: user.memberId,
                },
        });
      }
      return { updated: lines.length };
    });
  }

  private async reconcileOrThrow(
    projectId: string,
    lineUpdates: ReceiptLineUpdate[],
    totalAmount: number,
  ) {
    const lineIds = lineUpdates.map((l) => l.lineId);
    const lines = await this.prisma.estimateLine.findMany({
      where: { id: { in: lineIds }, stage: { projectId } },
      select: { id: true, qty: true },
    });
    if (lines.length !== lineIds.length) {
      throw AppErrors.badRequest('Una sau mai multe linii nu aparțin acestui proiect.');
    }
    const qtyById = new Map(lines.map((l) => [l.id, Number(l.qty)]));

    const reconciliationInput: ReceiptLineInput[] = lineUpdates.map((l) => ({
      lineId: l.lineId,
      actualUnitPrice: l.actualUnitPrice,
      actualQty: l.actualQty,
      smetaQty: qtyById.get(l.lineId) ?? 0,
    }));

    const result = reconcileReceipt(reconciliationInput, totalAmount);
    if (!result.ok) {
      throw AppErrors.badRequest({
        code: RECEIPT_RECONCILIATION_MISMATCH,
        message: 'Suma liniilor nu corespunde totalului chitanței.',
        expectedTotal: result.expectedTotal,
        computedSum: result.computedSum,
        diff: result.diff,
      });
    }
  }

  private async applyLineUpdates(
    tx: Prisma.TransactionClient,
    projectId: string,
    receiptId: string,
    lineUpdates: ReceiptLineUpdate[],
    memberId: string,
  ) {
    if (!lineUpdates.length) return;
    const ids = lineUpdates.map((l) => l.lineId);
    const lines = await tx.estimateLine.findMany({
      where: { id: { in: ids }, stage: { projectId } },
      select: { id: true, qty: true },
    });
    const qtyById = new Map(lines.map((l) => [l.id, Number(l.qty)]));

    for (const update of lineUpdates) {
      const smetaQty = qtyById.get(update.lineId);
      if (smetaQty === undefined) continue;
      const qty = update.actualQty ?? smetaQty;
      const total = round2(qty * update.actualUnitPrice);
      await tx.estimateLine.update({
        where: { id: update.lineId },
        data: {
          receiptId,
          actualUnitPrice: update.actualUnitPrice,
          actualQty: update.actualQty ?? null,
          actualLineTotal: total,
          actualNotes: update.actualNotes?.trim() || null,
          actualStatus: EstimateLineActualStatus.PURCHASED,
          actualStatusUpdatedAt: new Date(),
          actualStatusByMemberId: memberId,
        },
      });
    }
  }

  private async findReceiptOrThrow(user: JwtPayload, projectId: string, receiptId: string) {
    await this.access.findProjectOrThrow(user, projectId);
    const receipt = await this.prisma.estimateReceipt.findFirst({
      where: { id: receiptId, projectId, companyId: this.ctx.companyId(user) },
    });
    if (!receipt) {
      throw AppErrors.notFound(AppErrorMessages.RECORD_NOT_FOUND);
    }
    return receipt;
  }

  private assertProjectStatusAllowsReceipts(status: EstimateProjectStatus) {
    if (!RECEIPT_ALLOWED_STATUSES.has(status)) {
      throw AppErrors.badRequest(
        'Chitanțele se pot adăuga doar la smete calculate, aprobate sau în execuție.',
      );
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
