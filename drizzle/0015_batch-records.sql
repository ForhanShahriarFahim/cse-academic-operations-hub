ALTER TABLE batches ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE batches ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE batch_term_placements ADD COLUMN IF NOT EXISTS student_count integer;
--> statement-breakpoint
ALTER TABLE batch_term_placements ADD COLUMN IF NOT EXISTS count_source text;
--> statement-breakpoint
ALTER TABLE batch_term_placements ADD COLUMN IF NOT EXISTS count_origin text NOT NULL DEFAULT 'legacy_pending';
--> statement-breakpoint
ALTER TABLE batch_term_placements ADD COLUMN IF NOT EXISTS count_verified_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE batch_term_placements ADD COLUMN IF NOT EXISTS count_verified_by integer REFERENCES portal_users(id);
--> statement-breakpoint
ALTER TABLE batch_term_placements ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE batch_term_placements p SET
  student_count = CASE WHEN b.student_count >= 0 THEN b.student_count ELSE NULL END,
  count_source = CASE WHEN b.student_count IS NULL THEN NULL ELSE 'Legacy cohort value; historical term and verification not established' END,
  count_origin = CASE WHEN b.student_count < 0 THEN 'legacy_invalid' ELSE 'legacy' END
FROM batches b WHERE b.id = p.batch_id AND p.count_origin = 'legacy_pending';
--> statement-breakpoint
ALTER TABLE batch_term_placements ALTER COLUMN count_origin SET DEFAULT 'manual';
--> statement-breakpoint
-- Existing anomalous semesters/statuses are retained; validate only newly written
-- semester values, including inserts. A count-only update does not normalize history.
CREATE OR REPLACE FUNCTION validate_batch_placement_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.semester < 1 OR NEW.semester > 8 THEN RAISE EXCEPTION 'Semester must be 1 through 8' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.semester IS DISTINCT FROM OLD.semester THEN
    IF NEW.semester < 1 OR NEW.semester > 8 THEN RAISE EXCEPTION 'Semester must be 1 through 8' USING ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.student_count < 0 OR NEW.revision < 1 OR
     (NEW.count_verified_at IS NULL) <> (NEW.count_verified_by IS NULL) OR
     (NEW.count_verified_at IS NOT NULL AND (NEW.student_count IS NULL OR NULLIF(trim(NEW.count_source), '') IS NULL))
  THEN RAISE EXCEPTION 'Invalid placement count evidence' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS batch_placement_write ON batch_term_placements;
--> statement-breakpoint
CREATE TRIGGER batch_placement_write BEFORE INSERT OR UPDATE ON batch_term_placements FOR EACH ROW EXECUTE FUNCTION validate_batch_placement_write();
