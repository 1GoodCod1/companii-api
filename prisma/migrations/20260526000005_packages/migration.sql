-- Packages: public service packages & bookings
CREATE TABLE "service_packages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MDL',
    "duration_minutes" INTEGER NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "payment_mode" "PackagePaymentMode" NOT NULL,
    "total_bookings" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "package_bookings" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_email" TEXT,
    "status" "PackageBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "scheduled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "package_bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_packages_slug_key" ON "service_packages"("slug");
CREATE INDEX "service_packages_company_id_idx" ON "service_packages"("company_id");

ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "package_bookings" ADD CONSTRAINT "package_bookings_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "service_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
