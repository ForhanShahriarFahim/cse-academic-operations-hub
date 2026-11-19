-- CAL-01: term academic calendar. Additive only; a term without a row has no recorded calendar.
CREATE TABLE IF NOT EXISTS "term_calendars" (
  "term_id" integer PRIMARY KEY REFERENCES "academic_terms"("id"),
  "teaching_start" date,
  "teaching_end" date,
  "teaching_source" text,
  "teaching_source_url" text,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "term_calendars_teaching_pair_ck" CHECK (("teaching_start" IS NULL AND "teaching_end" IS NULL AND "teaching_source" IS NULL AND "teaching_source_url" IS NULL) OR ("teaching_start" IS NOT NULL AND "teaching_end" IS NOT NULL AND "teaching_source" IS NOT NULL AND "teaching_start" <= "teaching_end")),
  CONSTRAINT "term_calendars_source_ck" CHECK ("teaching_source" IS NULL OR (char_length("teaching_source") >= 1 AND char_length("teaching_source") <= 300 AND "teaching_source" = btrim("teaching_source"))),
  CONSTRAINT "term_calendars_url_ck" CHECK ("teaching_source_url" IS NULL OR (char_length("teaching_source_url") <= 500 AND "teaching_source_url" ~ '^https?://[^[:space:]]+$')),
  CONSTRAINT "term_calendars_revision_ck" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "term_calendar_entries" (
  "id" serial PRIMARY KEY,
  "term_id" integer NOT NULL REFERENCES "term_calendars"("term_id"),
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "regular_classes" text,
  "source" text NOT NULL,
  "source_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "term_calendar_entries_kind_ck" CHECK ("kind" IN ('public_holiday', 'university_holiday', 'class_suspension', 'midterm', 'final')),
  CONSTRAINT "term_calendar_entries_dates_ck" CHECK ("start_date" <= "end_date"),
  CONSTRAINT "term_calendar_entries_effect_ck" CHECK (("kind" IN ('midterm', 'final') AND "regular_classes" IS NOT NULL AND "regular_classes" IN ('continue', 'suspended')) OR ("kind" NOT IN ('midterm', 'final') AND "regular_classes" IS NULL)),
  CONSTRAINT "term_calendar_entries_title_ck" CHECK (char_length("title") >= 1 AND char_length("title") <= 120 AND "title" = btrim("title")),
  CONSTRAINT "term_calendar_entries_source_ck" CHECK (char_length("source") >= 1 AND char_length("source") <= 300 AND "source" = btrim("source")),
  CONSTRAINT "term_calendar_entries_url_ck" CHECK ("source_url" IS NULL OR (char_length("source_url") <= 500 AND "source_url" ~ '^https?://[^[:space:]]+$'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "term_calendar_entries_identity_uq" ON "term_calendar_entries" ("term_id", "kind", "start_date", "end_date", lower("title"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "term_calendar_entries_term_dates_idx" ON "term_calendar_entries" ("term_id", "start_date", "end_date");
