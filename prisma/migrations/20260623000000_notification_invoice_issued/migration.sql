-- Add INVOICE_ISSUED to the NotificationCategory enum so the portal client can
-- be notified when a company issues an invoice for them.
ALTER TYPE "NotificationCategory" ADD VALUE IF NOT EXISTS 'INVOICE_ISSUED' BEFORE 'QUOTE_SENT';
