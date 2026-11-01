ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD COLUMN IF NOT EXISTS "managed_setup" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "academic_terms" ALTER COLUMN "status" SET DEFAULT 'draft';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "term_context" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "generation" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "term_context_singleton" CHECK ("id" = 1),
  CONSTRAINT "term_context_positive" CHECK ("generation" > 0)
);
--> statement-breakpoint
INSERT INTO "term_context" ("id", "generation") VALUES (1, 1) ON CONFLICT ("id") DO NOTHING;
