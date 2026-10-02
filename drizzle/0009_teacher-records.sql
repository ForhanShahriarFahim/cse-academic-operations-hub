-- TCH-01 (#4): teacher records with a safe lifecycle. Forward-only.
-- Placeholder rows (UT vacancy, unresolved routine codes) keep their status and
-- lose their pseudo employment type; every existing teacher is otherwise unchanged.
ALTER TABLE "teachers"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "advisory_load_units" numeric(3, 1);
--> statement-breakpoint
ALTER TABLE "teachers" ALTER COLUMN "employment_type" DROP NOT NULL;
--> statement-breakpoint
UPDATE "teachers" SET "employment_type" = NULL WHERE "status" IN ('vacancy', 'unresolved');
--> statement-breakpoint
ALTER TABLE "teachers"
  ADD CONSTRAINT "teachers_status_ck" CHECK ("status" IN ('active', 'on_leave', 'inactive', 'vacancy', 'unresolved'));
--> statement-breakpoint
-- A placeholder has no employment type; every teacher has one of the three.
ALTER TABLE "teachers"
  ADD CONSTRAINT "teachers_employment_type_ck" CHECK (
    ("status" IN ('vacancy', 'unresolved') AND "employment_type" IS NULL)
    OR ("status" NOT IN ('vacancy', 'unresolved') AND "employment_type" IN ('full_time', 'part_time', 'guest'))
  );
--> statement-breakpoint
-- Advisory limit in half units from 1 to 40; null means the department default.
ALTER TABLE "teachers"
  ADD CONSTRAINT "teachers_advisory_load_units_ck" CHECK (
    "advisory_load_units" IS NULL
    OR ("advisory_load_units" BETWEEN 1 AND 40 AND "advisory_load_units" * 2 = trunc("advisory_load_units" * 2))
  );
--> statement-breakpoint
-- Short codes are exact identifiers, but two may not differ only in case.
CREATE UNIQUE INDEX IF NOT EXISTS "teachers_short_code_upper_uq" ON "teachers" (upper("short_code"));
