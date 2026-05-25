-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'VISIBLE', 'HIDDEN');

-- CreateTable
CREATE TABLE "company_reviews" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "intervention_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "client_name" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_reviews_intervention_id_key" ON "company_reviews"("intervention_id");

-- CreateIndex
CREATE INDEX "company_reviews_company_id_status_created_at_idx" ON "company_reviews"("company_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "company_reviews_author_user_id_idx" ON "company_reviews"("author_user_id");

-- AddForeignKey
ALTER TABLE "company_reviews" ADD CONSTRAINT "company_reviews_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_reviews" ADD CONSTRAINT "company_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_reviews" ADD CONSTRAINT "company_reviews_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_reviews" ADD CONSTRAINT "company_reviews_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
