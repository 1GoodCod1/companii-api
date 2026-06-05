import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EstimateProjectStatus } from '@prisma/client';
import { AppErrors, AppErrorMessages } from '../../../../common/errors';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { JwtPayload } from '../../../auth/types/jwt-payload';
import { EstimatesContextService } from '../../context/estimates-context.service';
import { EstimateProjectAccessService } from '../../services/projects/estimate-project-access.service';
import {
  RECEIPT_RECONCILIATION_MISMATCH,
  reconcileReceipt,
} from '../../utils/actuals/receipt-reconciliation.util';

const RECEIPT_ALLOWED_STATUSES: ReadonlySet<EstimateProjectStatus> = new Set([
  EstimateProjectStatus.CALCULATED,
  EstimateProjectStatus.APPROVED,
  EstimateProjectStatus.SENT,
  EstimateProjectStatus.ACCEPTED,
  EstimateProjectStatus.IN_EXECUTION,
  EstimateProjectStatus.DONE,
]);

type ReceiptLineUpdate = { lineId: string; actualUnitPrice: number; actualQty?: number; actualNotes?: string };
type CreateReceiptInput = { fileKey?: string | null; store: string; totalAmount: number; purchaseDate: string; lineUpdates: ReceiptLineUpdate[] };

function round2(n: number): number { return Math.round(n * 100) / 100; }

@Injectable()
export class CreateReceiptCommandHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: EstimatesContextService,
    private readonly access: EstimateProjectAccessService,
  ) {}

  async execute(user: JwtPayload, projectId: string, body: CreateReceiptInput) {
    const project = await this.access.findProjectOrThrow(user, projectId);
    if (!RECEIPT_ALLOWED_STATUSES.has(project.status)) {
      throw AppErrors.badRequest('Chitanțele se pot adăuga doar la calcule de preț calculate, aprobate sau în execuție.');
    }
    if (!user.memberId) throw AppErrors.forbidden(AppErrorMessages.COMPANY_ACCESS_DENIED);
    const memberId: string = user.memberId;
    if (project.actualsLockedAt) throw AppErrors.badRequest('Calculul de preț a fost deja blocat ("lock-actuals"). Nu se mai pot adăuga chitanțe noi.');

    const parsingRequired = !body.lineUpdates?.length || body.totalAmount <= 0;
    const lineUpdates = body.lineUpdates ?? [];

    if (!parsingRequired && lineUpdates.length > 0) {
      await this.reconcileOrThrow(projectId, lineUpdates, body.totalAmount);
    }

    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.estimateReceipt.create({
        data: {
          companyId: this.ctx.companyId(user), projectId,
          fileKey: body.fileKey ?? null, store: body.store.trim(),
          totalAmount: body.totalAmount, purchaseDate: new Date(body.purchaseDate),
          addedByMemberId: memberId, parsingRequired,
        },
      });
      await this.applyLineUpdates(tx, projectId, receipt.id, lineUpdates, memberId);
      return tx.estimateReceipt.findUniqueOrThrow({ where: { id: receipt.id }, include: { lines: true } });
    });
  }

  private async reconcileOrThrow(projectId: string, lineUpdates: ReceiptLineUpdate[], totalAmount: number) {
    const lineIds = lineUpdates.map((l) => l.lineId);
    const lines = await this.prisma.estimateLine.findMany({ where: { id: { in: lineIds }, stage: { projectId } }, select: { id: true, qty: true } });
    if (lines.length !== lineIds.length) throw AppErrors.badRequest('Una sau mai multe linii nu aparțin acestui proiect.');
    const qtyById = new Map(lines.map((l) => [l.id, Number(l.qty)]));
    const result = reconcileReceipt(
      lineUpdates.map((l) => ({ lineId: l.lineId, actualUnitPrice: l.actualUnitPrice, actualQty: l.actualQty, smetaQty: qtyById.get(l.lineId) ?? 0 })),
      totalAmount,
    );
    if (!result.ok) {
      throw AppErrors.badRequest({ code: RECEIPT_RECONCILIATION_MISMATCH, message: 'Suma liniilor nu corespunde totalului chitanței.', expectedTotal: result.expectedTotal, computedSum: result.computedSum, diff: result.diff });
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
    const lines = await tx.estimateLine.findMany({ where: { id: { in: ids }, stage: { projectId } }, select: { id: true, qty: true } });
    const qtyById = new Map(lines.map((l) => [l.id, Number(l.qty)]));
    for (const update of lineUpdates) {
      const smetaQty = qtyById.get(update.lineId);
      if (smetaQty === undefined) continue;
      const qty = update.actualQty ?? smetaQty;
      const total = round2(qty * update.actualUnitPrice);
      await tx.estimateLine.update({
        where: { id: update.lineId },
        data: {
          receiptId, actualUnitPrice: update.actualUnitPrice, actualQty: update.actualQty ?? null,
          actualLineTotal: total, actualNotes: update.actualNotes?.trim() || null,
          actualStatus: 'PURCHASED' as const, actualStatusUpdatedAt: new Date(), actualStatusByMemberId: memberId,
        },
      });
    }
  }
}