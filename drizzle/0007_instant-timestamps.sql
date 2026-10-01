-- BUG-29 (#29): every stored time becomes an absolute instant (timestamptz).
-- Old values were written two ways. A database default (now()) stored the wall
-- time of the session's TimeZone, so a plain cast reads it in that same zone.
-- An application write (Drizzle, toISOString) stored UTC wall time, so it is
-- read AT TIME ZONE 'UTC'. Column classes are listed in docs/specs/BUG-29/plan.md.
-- Drizzle runs pending migrations in one transaction; any error below rolls
-- back the whole run and leaves the database unchanged.
DO $$
BEGIN
  IF coalesce(current_setting('TimeZone', true), '') = '' THEN
    RAISE EXCEPTION 'BUG-29: the session TimeZone is not set, so default-stamped times cannot be converted. Nothing was changed.';
  END IF;
END $$;
--> statement-breakpoint
-- Mixed: defaulted on insert, set by the application on edit. A value equal to
-- created_at came from the default. Converted before created_at changes type.
ALTER TABLE "portal_users"
  ALTER COLUMN "updated_at" TYPE timestamp with time zone
  USING CASE WHEN "updated_at" = "created_at" THEN "updated_at"::timestamp with time zone ELSE "updated_at" AT TIME ZONE 'UTC' END;
--> statement-breakpoint
-- Database default only, plus the mixed columns treated as default-stamped.
ALTER TABLE "portal_users" ALTER COLUMN "created_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "role_assignments"
  ALTER COLUMN "active_from" TYPE timestamp with time zone,
  ALTER COLUMN "granted_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "routine_source_reconciliations" ALTER COLUMN "created_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "created_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "course_enrollments" ALTER COLUMN "created_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ALTER COLUMN "created_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "extra_load_classes" ALTER COLUMN "created_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "extra_load_manual_summaries" ALTER COLUMN "created_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "academic_policies" ALTER COLUMN "updated_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "updated_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "attendance_records" ALTER COLUMN "updated_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "period_patterns"
  ALTER COLUMN "created_at" TYPE timestamp with time zone,
  ALTER COLUMN "updated_at" TYPE timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "day_plans"
  ALTER COLUMN "created_at" TYPE timestamp with time zone,
  ALTER COLUMN "updated_at" TYPE timestamp with time zone;
--> statement-breakpoint
-- Application only: stored as UTC wall time.
ALTER TABLE "portal_users" ALTER COLUMN "last_login_at" TYPE timestamp with time zone USING "last_login_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "role_assignments" ALTER COLUMN "active_to" TYPE timestamp with time zone USING "active_to" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "auth_user"
  ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "auth_session"
  ALTER COLUMN "expires_at" TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "auth_account"
  ALTER COLUMN "access_token_expires_at" TYPE timestamp with time zone USING "access_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "refresh_token_expires_at" TYPE timestamp with time zone USING "refresh_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "auth_verification"
  ALTER COLUMN "expires_at" TYPE timestamp with time zone USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "external_commitments" ALTER COLUMN "last_verified_at" TYPE timestamp with time zone USING "last_verified_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "schedule_versions" ALTER COLUMN "published_at" TYPE timestamp with time zone USING "published_at" AT TIME ZONE 'UTC';
--> statement-breakpoint
-- Guard: a default-stamped time in the future means the session zone is not
-- the zone that stamped it (for example a UTC+06 database migrated from UTC).
DO $$
DECLARE
  target record;
  future bigint;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('portal_users', 'created_at'), ('portal_users', 'updated_at'),
    ('role_assignments', 'active_from'), ('role_assignments', 'granted_at'),
    ('routine_source_reconciliations', 'created_at'), ('meetings', 'created_at'),
    ('course_enrollments', 'created_at'), ('attendance_sessions', 'created_at'),
    ('extra_load_classes', 'created_at'), ('extra_load_manual_summaries', 'created_at'),
    ('audit_events', 'at'), ('academic_policies', 'updated_at'), ('students', 'updated_at'),
    ('attendance_records', 'updated_at'), ('period_patterns', 'created_at'),
    ('period_patterns', 'updated_at'), ('day_plans', 'created_at'), ('day_plans', 'updated_at')
  ) AS c(table_name, column_name) LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE %I > now() + interval ''5 minutes''', target.table_name, target.column_name) INTO future;
    IF future > 0 THEN
      RAISE EXCEPTION 'BUG-29: % value(s) in %.% would lie in the future when read in time zone %. That zone did not stamp them. Nothing was changed.',
        future, target.table_name, target.column_name, current_setting('TimeZone');
    END IF;
  END LOOP;
END $$;
