LOCK TABLE "schedule_versions" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
DECLARE
  duplicate_numbers integer;
  duplicate_published integer;
BEGIN
  SELECT count(*) INTO duplicate_numbers FROM (
    SELECT 1 FROM "schedule_versions" GROUP BY "term_id", "version_number" HAVING count(*) > 1
  ) AS numbers;
  SELECT count(*) INTO duplicate_published FROM (
    SELECT 1 FROM "schedule_versions" WHERE "state" = 'published' GROUP BY "term_id" HAVING count(*) > 1
  ) AS published;
  IF duplicate_numbers > 0 OR duplicate_published > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('BUG-25 preflight: %s term/version-number pair(s) are duplicated and %s term(s) have more than one published version. Obtain an owner-approved correction before retrying. No publication row has been changed.', duplicate_numbers, duplicate_published);
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_versions_term_version_uq" ON "schedule_versions" ("term_id", "version_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_versions_one_published_uq" ON "schedule_versions" ("term_id") WHERE "state" = 'published';
