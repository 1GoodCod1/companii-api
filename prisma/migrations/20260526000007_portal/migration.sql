-- Portal: B2C customers linked to companies
CREATE TABLE "company_customers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "portal_user_id" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_customer_documents" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_customer_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portal_invitations" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "portal_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_customers_portal_user_id_key" ON "company_customers"("portal_user_id");
CREATE INDEX "company_customers_company_id_idx" ON "company_customers"("company_id");
CREATE UNIQUE INDEX "portal_invitations_token_key" ON "portal_invitations"("token");

ALTER TABLE "company_customers" ADD CONSTRAINT "company_customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_customers" ADD CONSTRAINT "company_customers_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_customer_documents" ADD CONSTRAINT "company_customer_documents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portal_invitations" ADD CONSTRAINT "portal_invitations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "company_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
