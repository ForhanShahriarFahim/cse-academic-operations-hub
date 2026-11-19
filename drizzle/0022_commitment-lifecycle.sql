-- OD-01A: lifecycle, verification note and revision for cross-department commitments.
-- Additive: existing rows become active at revision 1; no existing value is changed.
ALTER TABLE "external_commitments" ADD COLUMN IF NOT EXISTS "lifecycle_status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "external_commitments" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "external_commitments" ADD COLUMN IF NOT EXISTS "archive_reason" text;
--> statement-breakpoint
ALTER TABLE "external_commitments" ADD COLUMN IF NOT EXISTS "verification_note" text;
--> statement-breakpoint
ALTER TABLE "external_commitments" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "external_commitments" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_commitments_lifecycle_ck' AND conrelid = 'external_commitments'::regclass) THEN ALTER TABLE "external_commitments" ADD CONSTRAINT "external_commitments_lifecycle_ck" CHECK (("lifecycle_status" = 'active' AND "archived_at" IS NULL AND "archive_reason" IS NULL) OR ("lifecycle_status" = 'archived' AND "archived_at" IS NOT NULL AND "archive_reason" IS NOT NULL AND char_length("archive_reason") >= 1 AND char_length("archive_reason") <= 300)); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_commitments_revision_ck' AND conrelid = 'external_commitments'::regclass) THEN ALTER TABLE "external_commitments" ADD CONSTRAINT "external_commitments_revision_ck" CHECK ("revision" >= 1); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_commitments_verification_note_ck' AND conrelid = 'external_commitments'::regclass) THEN ALTER TABLE "external_commitments" ADD CONSTRAINT "external_commitments_verification_note_ck" CHECK ("verification_note" IS NULL OR (char_length("verification_note") >= 1 AND char_length("verification_note") <= 300)); END IF; END $$;
