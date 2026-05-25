-- AlterTable
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "terms_version" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
