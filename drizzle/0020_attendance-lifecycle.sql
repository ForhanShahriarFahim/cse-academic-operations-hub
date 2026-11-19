-- ATT-03A: attendance session lifecycle. Additive; existing sessions become unsubmitted drafts (status default, revision 0).
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "submitted_by_user_id" integer REFERENCES "portal_users"("id");
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "locked_by_user_id" integer REFERENCES "portal_users"("id");
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "voided_by_user_id" integer REFERENCES "portal_users"("id");
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN IF NOT EXISTS "void_reason" text;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_status_ck' AND conrelid = 'attendance_sessions'::regclass) THEN ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_status_ck" CHECK ("status" IN ('draft', 'submitted', 'reopened', 'locked', 'voided')); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_revision_ck' AND conrelid = 'attendance_sessions'::regclass) THEN ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_revision_ck" CHECK ("revision" >= 0); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_actor_pairs_ck' AND conrelid = 'attendance_sessions'::regclass) THEN ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_actor_pairs_ck" CHECK (("submitted_at" IS NULL) = ("submitted_by_user_id" IS NULL) AND ("locked_at" IS NULL) = ("locked_by_user_id" IS NULL) AND ("voided_at" IS NULL) = ("voided_by_user_id" IS NULL) AND ("voided_at" IS NULL) = ("void_reason" IS NULL)); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_void_reason_ck' AND conrelid = 'attendance_sessions'::regclass) THEN ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_void_reason_ck" CHECK ("void_reason" IS NULL OR (char_length("void_reason") >= 3 AND char_length("void_reason") <= 300 AND "void_reason" = btrim("void_reason"))); END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_state_ck' AND conrelid = 'attendance_sessions'::regclass) THEN ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_state_ck" CHECK (("status" = 'draft' AND "submitted_at" IS NULL AND "locked_at" IS NULL AND "voided_at" IS NULL) OR ("status" IN ('submitted', 'reopened') AND "submitted_at" IS NOT NULL AND "locked_at" IS NULL AND "voided_at" IS NULL) OR ("status" = 'locked' AND "submitted_at" IS NOT NULL AND "locked_at" IS NOT NULL AND "voided_at" IS NULL) OR ("status" = 'voided' AND "submitted_at" IS NOT NULL AND "locked_at" IS NULL AND "voided_at" IS NOT NULL)); END IF; END $$;
