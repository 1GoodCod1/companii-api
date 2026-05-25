ALTER TABLE "companies" ADD COLUMN "logo_url" TEXT;

CREATE TABLE "company_gallery_images" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_gallery_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_gallery_images_company_id_sort_order_idx" ON "company_gallery_images"("company_id", "sort_order");

ALTER TABLE "company_gallery_images" ADD CONSTRAINT "company_gallery_images_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
