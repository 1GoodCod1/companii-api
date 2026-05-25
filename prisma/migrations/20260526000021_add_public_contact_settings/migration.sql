-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "show_public_email" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_public_phone" BOOLEAN NOT NULL DEFAULT true;
