/*
  Warnings:

  - You are about to drop the column `grand_total` on the `estimate_versions` table. All the data in the column will be lost.
  - You are about to drop the column `line_count` on the `estimate_versions` table. All the data in the column will be lost.
  - Added the required column `grandTotal` to the `estimate_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lineCount` to the `estimate_versions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "estimate_applied_mutations" DROP CONSTRAINT "estimate_applied_mutations_project_fk";

-- DropForeignKey
ALTER TABLE "estimate_comments" DROP CONSTRAINT "estimate_comments_project_id_fkey";

-- DropForeignKey
ALTER TABLE "estimate_lines" DROP CONSTRAINT "estimate_lines_receipt_fk";

-- DropForeignKey
ALTER TABLE "estimate_receipts" DROP CONSTRAINT "estimate_receipts_company_fk";

-- DropForeignKey
ALTER TABLE "estimate_receipts" DROP CONSTRAINT "estimate_receipts_project_fk";

-- DropForeignKey
ALTER TABLE "estimate_versions" DROP CONSTRAINT "estimate_versions_project_id_fkey";

-- AlterTable
ALTER TABLE "estimate_comments" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "estimate_receipts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "estimate_versions" DROP COLUMN "grand_total",
DROP COLUMN "line_count",
ADD COLUMN     "grandTotal" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "lineCount" INTEGER NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "estimate_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stages" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_templates_company_id_idx" ON "estimate_templates"("company_id");

-- AddForeignKey
ALTER TABLE "estimate_templates" ADD CONSTRAINT "estimate_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_applied_mutations" ADD CONSTRAINT "estimate_applied_mutations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "estimate_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_receipts" ADD CONSTRAINT "estimate_receipts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_receipts" ADD CONSTRAINT "estimate_receipts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_versions" ADD CONSTRAINT "estimate_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_comments" ADD CONSTRAINT "estimate_comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_estimate_comments_project" RENAME TO "estimate_comments_project_id_created_at_idx";

-- RenameIndex
ALTER INDEX "idx_estimate_version_project" RENAME TO "estimate_versions_project_id_created_at_idx";

-- RenameIndex
ALTER INDEX "uq_estimate_version" RENAME TO "estimate_versions_project_id_version_key";
