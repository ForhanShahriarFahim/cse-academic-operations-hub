LOCK TABLE "academic_terms" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF (SELECT count(*) FROM "academic_terms" WHERE "status" = 'active') > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'BUG-28 preflight: more than one academic term is active. Run db:check-terms and obtain an owner-approved remediation before retrying. No term has been selected or changed.';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "academic_terms_one_active_uq" ON "academic_terms" ("status") WHERE "status" = 'active';
