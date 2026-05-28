-- Portal feedback history for estimates (F-05).
-- Stored as JSON array of { kind: 'ACCEPT' | 'REJECT' | 'REQUEST_CHANGES', comment?, createdAt }
-- so the client can request revisions without losing prior history and without
-- conflating "request-changes" with CANCELLED.

ALTER TABLE "estimate_projects"
  ADD COLUMN "client_feedback" JSONB;
