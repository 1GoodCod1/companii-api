-- DropForeignKey
ALTER TABLE "companies" DROP CONSTRAINT "companies_owner_user_id_fkey";

-- DropForeignKey
ALTER TABLE "estimate_projects" DROP CONSTRAINT "estimate_projects_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "intervention_notes" DROP CONSTRAINT "intervention_notes_author_member_id_fkey";

-- DropForeignKey
ALTER TABLE "intervention_status_history" DROP CONSTRAINT "intervention_status_history_changed_by_member_id_fkey";

-- DropForeignKey
ALTER TABLE "interventions" DROP CONSTRAINT "interventions_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_customer_id_fkey";

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "cities" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "estimate_lines" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "intervention_photos" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "quote_lines" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "estimate_feedbacks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "project_id" TEXT,
    "category" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_feedbacks_user_id_idx" ON "estimate_feedbacks"("user_id");

-- CreateIndex
CREATE INDEX "estimate_feedbacks_created_at_idx" ON "estimate_feedbacks"("created_at");

-- CreateIndex
CREATE INDEX "estimate_lines_receipt_idx" ON "estimate_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "estimate_lines_actual_status_idx" ON "estimate_lines"("actual_status");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_status_history" ADD CONSTRAINT "intervention_status_history_changed_by_member_id_fkey" FOREIGN KEY ("changed_by_member_id") REFERENCES "company_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_notes" ADD CONSTRAINT "intervention_notes_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "company_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_projects" ADD CONSTRAINT "estimate_projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_feedbacks" ADD CONSTRAINT "estimate_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_feedbacks" ADD CONSTRAINT "estimate_feedbacks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_feedbacks" ADD CONSTRAINT "estimate_feedbacks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
