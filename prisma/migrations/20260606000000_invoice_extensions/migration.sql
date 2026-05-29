-- P2.#3 — CANCELLED invoice status (for vendor errors / refused contracts).
-- Existing enum order must be preserved; we append only.
ALTER TYPE "InvoicePaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- P2.#3 — audit fields for cancellation (reason is required at service layer).
ALTER TABLE "company_invoices"
  ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

-- P2.#16 — partial payment accumulator. Auto-promotes to PAID when paid_amount
-- reaches amount + tva_amount. Backwards-compat: existing rows start at 0;
-- already-PAID invoices stay PAID regardless (status is the source of truth).
ALTER TABLE "company_invoices"
  ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Filtering by paid/unpaid stays via paymentStatus index; aging on paid_amount
-- doesn't justify a separate index yet.
