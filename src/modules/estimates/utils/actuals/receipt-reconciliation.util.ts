export const RECEIPT_RECONCILIATION_TOLERANCE = 0.02;
export const RECEIPT_RECONCILIATION_MISMATCH = 'RECEIPT_TOTAL_MISMATCH';

export type ReceiptLineInput = {
  lineId: string;
  actualUnitPrice: number;
  actualQty?: number;
  smetaQty: number;
};

export type ReceiptReconciliationResult = {
  ok: boolean;
  computedSum: number;
  expectedTotal: number;
  diff: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lineActualTotal(input: ReceiptLineInput): number {
  const qty = input.actualQty ?? input.smetaQty;
  return round2(qty * input.actualUnitPrice);
}

export function reconcileReceipt(
  lines: ReceiptLineInput[],
  expectedTotal: number,
): ReceiptReconciliationResult {
  const computed = round2(
    lines.reduce((acc, line) => acc + lineActualTotal(line), 0),
  );
  const diff = round2(computed - expectedTotal);
  const ok = Math.abs(diff) <= RECEIPT_RECONCILIATION_TOLERANCE;
  return { ok, computedSum: computed, expectedTotal: round2(expectedTotal), diff };
}
