-- Companies: core B2B tenant
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "idno" VARCHAR(13) NOT NULL,
    "legal_address" TEXT NOT NULL,
    "is_tva_payer" BOOLEAN NOT NULL DEFAULT false,
    "tva_code" TEXT,
    "description" TEXT,
    "city_id" TEXT NOT NULL,
    "category_id" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_reviews" INTEGER NOT NULL DEFAULT 0,
    "team_size" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_waitlist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_waitlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_members" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "CompanyRole" NOT NULL,
    "status" "CompanyMemberStatus" NOT NULL DEFAULT 'PENDING',
    "full_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "specialization" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "contract_accepted_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_invitations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invited_email" TEXT,
    "invited_user_id" TEXT,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "role" "CompanyRole" NOT NULL DEFAULT 'MEMBER',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_documents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_consents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "consent_type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "lawful_basis" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ip_address" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");
CREATE UNIQUE INDEX "companies_idno_key" ON "companies"("idno");
CREATE INDEX "companies_city_id_idx" ON "companies"("city_id");
CREATE INDEX "companies_is_published_is_verified_idx" ON "companies"("is_published", "is_verified");
CREATE INDEX "company_waitlist_email_idx" ON "company_waitlist"("email");
CREATE UNIQUE INDEX "company_members_company_id_user_id_key" ON "company_members"("company_id", "user_id");
CREATE UNIQUE INDEX "company_invitations_token_key" ON "company_invitations"("token");
CREATE UNIQUE INDEX "company_consents_company_id_member_id_consent_type_key" ON "company_consents"("company_id", "member_id", "consent_type");

ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "companies" ADD CONSTRAINT "companies_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "companies" ADD CONSTRAINT "companies_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_invitations" ADD CONSTRAINT "company_invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_consents" ADD CONSTRAINT "company_consents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
