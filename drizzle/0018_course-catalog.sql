ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'courses'::regclass AND conname = 'courses_revision_positive') THEN
    ALTER TABLE "courses" ADD CONSTRAINT "courses_revision_positive" CHECK ("revision" > 0);
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courses_canonical_code_idx" ON "courses" (upper(btrim("code")));
