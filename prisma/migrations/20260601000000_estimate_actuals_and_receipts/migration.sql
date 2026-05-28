-- V-01 / V-11: actual prices + lifecycle + receipts table.
-- Smetă (`unitPrice/lineTotal`) is the forecast at /calculate time.
-- The `actual_*` columns capture what was really paid for the material
-- once a receipt is added on site. They stay NULL until the technician
-- enters them (default lifecycle status `PENDING`).

CREATE TYPE "EstimateLineActualStatus" AS ENUM (
  'PENDING',
  'PURCHASED',
  'NO_RECEIPT',
  'SKIPPED',
  'VERIFIED'
);

ALTER TABLE "estimate_lines"
  ADD COLUMN "actual_unit_price"        DECIMAL(12, 2),
  ADD COLUMN "actual_line_total"        DECIMAL(12, 2),
  ADD COLUMN "actual_qty"               DECIMAL(10, 2),
  ADD COLUMN "actual_notes"             TEXT,
  ADD COLUMN "actual_status"            "EstimateLineActualStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "actual_status_updated_at" TIMESTAMP(3),
  ADD COLUMN "actual_status_by_member_id" TEXT,
  ADD COLUMN "receipt_id"               TEXT;

CREATE TABLE "estimate_receipts" (
  "id"                  TEXT PRIMARY KEY,
  "company_id"          TEXT NOT NULL,
  "project_id"          TEXT NOT NULL,
  "file_key"            TEXT,
  "store"               TEXT NOT NULL,
  "total_amount"        DECIMAL(12, 2) NOT NULL,
  "purchase_date"       TIMESTAMP(3) NOT NULL,
  "added_by_member_id"  TEXT NOT NULL,
  "verified"            BOOLEAN NOT NULL DEFAULT FALSE,
  "verified_by_member_id" TEXT,
  "verified_at"         TIMESTAMP(3),
  "parsing_required"    BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "estimate_receipts_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "estimate_receipts_project_fk"
    FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE
);

CREATE INDEX "estimate_receipts_project_idx" ON "estimate_receipts"("project_id");
CREATE INDEX "estimate_receipts_company_purchase_idx"
  ON "estimate_receipts"("company_id", "purchase_date");

-- Connect lines to receipts (nullable: a line may be PENDING/NO_RECEIPT/SKIPPED
-- and never get a receipt id).
ALTER TABLE "estimate_lines"
  ADD CONSTRAINT "estimate_lines_receipt_fk"
    FOREIGN KEY ("receipt_id") REFERENCES "estimate_receipts"("id") ON DELETE SET NULL;

CREATE INDEX "estimate_lines_receipt_idx" ON "estimate_lines"("receipt_id");
CREATE INDEX "estimate_lines_actual_status_idx" ON "estimate_lines"("actual_status");

-- Lock-actuals timestamp at project level (V-05).
ALTER TABLE "estimate_projects"
  ADD COLUMN "actuals_locked_at" TIMESTAMP(3);
