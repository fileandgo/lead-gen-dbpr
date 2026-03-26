-- CreateTable: google_resolutions
CREATE TABLE "google_resolutions" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "resolved_name" TEXT,
    "resolved_domain" TEXT,
    "resolved_website" TEXT,
    "resolved_phone" TEXT,
    "resolved_address" TEXT,
    "google_place_id" TEXT,
    "match_status" TEXT NOT NULL DEFAULT 'pending',
    "confidence" DOUBLE PRECISION,
    "search_query" TEXT,
    "error_reason" TEXT,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: google_resolution_runs
CREATE TABLE "google_resolution_runs" (
    "id" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL DEFAULT 'auto',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_submitted" INTEGER NOT NULL DEFAULT 0,
    "total_matched" INTEGER NOT NULL DEFAULT 0,
    "total_possible" INTEGER NOT NULL DEFAULT 0,
    "total_no_match" INTEGER NOT NULL DEFAULT 0,
    "total_failed" INTEGER NOT NULL DEFAULT 0,
    "business_ids_json" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_resolution_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: app_settings
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_resolutions_business_id_key" ON "google_resolutions"("business_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- AddForeignKey
ALTER TABLE "google_resolutions" ADD CONSTRAINT "google_resolutions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
