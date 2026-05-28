-- AlterTable
ALTER TABLE "estimate_lines" ADD COLUMN     "vat_rate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "estimate_projects" ADD COLUMN     "grand_total_with_vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tva_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tva_rate" DECIMAL(5,2);
