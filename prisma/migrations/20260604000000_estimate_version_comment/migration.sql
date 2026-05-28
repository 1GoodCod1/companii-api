-- V-05: Estimate version snapshot table
CREATE TABLE "estimate_versions" (
    "id"          TEXT     NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "project_id"  TEXT     NOT NULL REFERENCES "estimate_projects"("id") ON DELETE CASCADE,
    "version"     INTEGER  NOT NULL,
    "label"       TEXT,
    "snapshot"    JSONB    NOT NULL,
    "line_count"  INTEGER  NOT NULL,
    "grand_total" DECIMAL(12, 2) NOT NULL,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "uq_estimate_version" UNIQUE ("project_id", "version")
);

CREATE INDEX "idx_estimate_version_project" ON "estimate_versions" ("project_id", "created_at");

-- V-06: Estimate comment thread
CREATE TABLE "estimate_comments" (
    "id"          TEXT     NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    "project_id"  TEXT     NOT NULL REFERENCES "estimate_projects"("id") ON DELETE CASCADE,
    "author_id"   TEXT     NOT NULL,
    "author_kind" TEXT     NOT NULL,  -- 'CLIENT' | 'CONTRACTOR'
    "body"        TEXT     NOT NULL,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "idx_estimate_comments_project" ON "estimate_comments" ("project_id", "created_at");