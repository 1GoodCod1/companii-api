-- File visibility for B2 split-bucket storage.
-- Existing rows default to PRIVATE for safety (never auto-publish historical
-- uploads). Public uploads will be created from the application going forward.

CREATE TYPE "FileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "files"
  ADD COLUMN "visibility" "FileVisibility" NOT NULL DEFAULT 'PRIVATE';

CREATE INDEX "files_visibility_idx" ON "files"("visibility");
