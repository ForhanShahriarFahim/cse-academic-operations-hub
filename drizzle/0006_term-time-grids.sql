CREATE TABLE IF NOT EXISTS "period_patterns" (
  "id" serial PRIMARY KEY,
  "term_id" integer NOT NULL REFERENCES "academic_terms"("id"),
  "name" text NOT NULL,
  "periods" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "breaks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "period_patterns_term_name_uq" ON "period_patterns" ("term_id", "name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "day_plans" (
  "id" serial PRIMARY KEY,
  "term_id" integer NOT NULL REFERENCES "academic_terms"("id"),
  "stream" text NOT NULL,
  "batch_id" integer REFERENCES "batches"("id"),
  "day_of_week" integer NOT NULL,
  "pattern_id" integer REFERENCES "period_patterns"("id"),
  "reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "day_plans_day_ck" CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "day_plans_stream_ck" CHECK ("stream" IN ('HSC', 'DIPLOMA')),
  CONSTRAINT "day_plans_stream_pattern_ck" CHECK ("batch_id" IS NOT NULL OR "pattern_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "day_plans_term_idx" ON "day_plans" ("term_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "day_plans_stream_day_uq" ON "day_plans" ("term_id", "stream", "day_of_week") WHERE "batch_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "day_plans_batch_day_uq" ON "day_plans" ("term_id", "batch_id", "day_of_week") WHERE "batch_id" IS NOT NULL;
