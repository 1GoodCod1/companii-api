ALTER TABLE "estimate_projects"
  ADD COLUMN "client_mutation_id" TEXT,
  ADD COLUMN "client_draft_id" TEXT;


CREATE TABLE "estimate_applied_mutations" (
  "id"              TEXT PRIMARY KEY,
  "project_id"      TEXT NOT NULL,
  "mutation_id"     TEXT NOT NULL,
  "kind"            TEXT NOT NULL,
  "applied_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "client_draft_id" TEXT,
  CONSTRAINT "estimate_applied_mutations_project_fk"
    FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "estimate_applied_mutations_project_mutation_idx"
  ON "estimate_applied_mutations"("project_id", "mutation_id");

CREATE INDEX "estimate_applied_mutations_applied_at_idx"
  ON "estimate_applied_mutations"("applied_at");
