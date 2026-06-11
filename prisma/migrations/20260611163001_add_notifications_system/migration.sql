-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TELEGRAM', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('NEW_LEAD', 'LEAD_STATUS_UPDATED', 'NEW_REVIEW', 'SUBSCRIPTION_EXPIRING', 'PAYMENT_SUCCESS', 'QUOTE_SENT', 'QUOTE_ACCEPTED', 'INTERVENTION_SCHEDULED', 'INTERVENTION_COMPLETED', 'NEW_PORTAL_CUSTOMER', 'SYSTEM_UPDATE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED', 'READ');

-- CreateEnum
CREATE TYPE "LeadNotifyChannel" AS ENUM ('TELEGRAM', 'IN_APP', 'BOTH', 'NONE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lead_notify_channel" "LeadNotifyChannel" DEFAULT 'BOTH',
ADD COLUMN     "notify_in_app" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "telegram_chat_id" TEXT;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "category" "NotificationCategory",
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_connect_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_connect_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "notifications_category_idx" ON "notifications"("category");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_status_created_at_idx" ON "notifications"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_type_created_at_idx" ON "notifications"("user_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_category_created_at_idx" ON "notifications"("user_id", "category", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_connect_tokens_token_key" ON "telegram_connect_tokens"("token");

-- CreateIndex
CREATE INDEX "telegram_connect_tokens_token_idx" ON "telegram_connect_tokens"("token");

-- CreateIndex
CREATE INDEX "telegram_connect_tokens_user_id_idx" ON "telegram_connect_tokens"("user_id");

-- CreateIndex
CREATE INDEX "telegram_connect_tokens_expires_at_idx" ON "telegram_connect_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_connect_tokens" ADD CONSTRAINT "telegram_connect_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
