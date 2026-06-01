-- CreateTable
CREATE TABLE "estimate_applied_mutations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "mutation_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_draft_id" TEXT,

    CONSTRAINT "estimate_applied_mutations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_receipts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "file_key" TEXT,
    "store" TEXT NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "added_by_member_id" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by_member_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "parsing_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimate_applied_mutations_project_mutation_idx" ON "estimate_applied_mutations"("project_id", "mutation_id");

-- CreateIndex
CREATE INDEX "estimate_applied_mutations_applied_at_idx" ON "estimate_applied_mutations"("applied_at");

-- CreateIndex
CREATE INDEX "estimate_receipts_project_idx" ON "estimate_receipts"("project_id");

-- CreateIndex
CREATE INDEX "estimate_receipts_company_purchase_idx" ON "estimate_receipts"("company_id", "purchase_date");

-- AddForeignKey
ALTER TABLE "estimate_applied_mutations" ADD CONSTRAINT "estimate_applied_mutations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_receipts" ADD CONSTRAINT "estimate_receipts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_receipts" ADD CONSTRAINT "estimate_receipts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "estimate_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
