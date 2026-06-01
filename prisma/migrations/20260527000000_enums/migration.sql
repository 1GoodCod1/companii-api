-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('COMPANY_STAFF', 'END_CLIENT', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('OWNER', 'MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "CompanyMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanySubscriptionPlan" AS ENUM ('FREE', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "CompanySubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InterventionStatus" AS ENUM ('NEW', 'SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE', 'CANCELLED', 'PENDING_CONFIRMATION');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TEAM_DATA_PROCESSING', 'PORTAL_DATA_PROCESSING');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "EstimateProjectStatus" AS ENUM ('DRAFT', 'MEASURED', 'CALCULATED', 'APPROVED', 'SENT', 'ACCEPTED', 'IN_EXECUTION', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EstimateStageKind" AS ENUM ('LABOR', 'MATERIAL', 'MIXED');

-- CreateEnum
CREATE TYPE "CompanyLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "CompanyLeadSource" AS ENUM ('SERVICE_REQUEST', 'MANUAL', 'PHONE', 'WEBSITE', 'PROJECT_REQUEST');

-- CreateEnum
CREATE TYPE "PaymentProductType" AS ENUM ('COMPANY_SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "EstimateLineActualStatus" AS ENUM ('PENDING', 'PURCHASED', 'NO_RECEIPT', 'SKIPPED', 'VERIFIED');
