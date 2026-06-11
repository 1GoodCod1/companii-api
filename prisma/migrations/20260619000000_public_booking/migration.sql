-- Public online booking: lead source + per-company booking settings

ALTER TYPE "CompanyLeadSource" ADD VALUE IF NOT EXISTS 'BOOKING';

ALTER TABLE companies ADD COLUMN booking_settings JSONB;
