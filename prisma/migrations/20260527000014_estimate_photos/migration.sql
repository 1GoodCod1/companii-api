-- CreateTable
CREATE TABLE "estimate_project_photos" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_project_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_project_photos_project_id_sort_order_idx" ON "estimate_project_photos"("project_id", "sort_order");

-- AddForeignKey
ALTER TABLE "estimate_project_photos" ADD CONSTRAINT "estimate_project_photos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "estimate_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
