-- Add an optional approximate work duration (in minutes) to interventions and
-- leads. Used by online booking and company scheduling to block overlapping
-- works (duration-aware double-booking protection). Nullable: duration is
-- optional and may span minutes, hours or days.
ALTER TABLE "interventions" ADD COLUMN "duration_minutes" INTEGER;
ALTER TABLE "company_leads" ADD COLUMN "duration_minutes" INTEGER;
