-- Add PENDING_CONFIRMATION to invoice payment status enum
ALTER TYPE "InvoicePaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING_CONFIRMATION';

-- Payment proof fields for client upload + manager confirmation flow
ALTER TABLE "company_invoices" ADD COLUMN IF NOT EXISTS "payment_proof_file_key" TEXT;
ALTER TABLE "company_invoices" ADD COLUMN IF NOT EXISTS "payment_proof_submitted_at" TIMESTAMP(3);
ALTER TABLE "company_invoices" ADD COLUMN IF NOT EXISTS "payment_proof_confirmed_by_member_id" TEXT;
ALTER TABLE "company_invoices" ADD COLUMN IF NOT EXISTS "payment_proof_confirmed_at" TIMESTAMP(3);
ALTER TABLE "company_invoices" ADD COLUMN IF NOT EXISTS "payment_proof_rejection_reason" TEXT;
ALTER TABLE "company_invoices" ADD COLUMN IF NOT EXISTS "payment_proof_rejected_at" TIMESTAMP(3);
