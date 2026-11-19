-- SET-01B: effective-dated policy versions. Additive; writes no rows, so every existing term keeps its baseline figures.
-- Checks avoid BETWEEN so restored definitions deparse identically (dump/restore fingerprint parity).
-- Version 1 is approved only for a term that had no baseline row; its approval also records that baseline.
CREATE TABLE IF NOT EXISTS "academic_policy_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "term_id" integer NOT NULL REFERENCES "academic_terms"("id"),
  "version" integer,
  "status" text DEFAULT 'proposed' NOT NULL,
  "effective_from" date NOT NULL,
  "extra_load_threshold_credits" numeric(4, 1) NOT NULL,
  "extra_class_rate" numeric(10, 2) NOT NULL,
  "theory_attendance_marks" numeric(4, 1) NOT NULL,
  "sessional_attendance_marks" numeric(4, 1) NOT NULL,
  "reason" text NOT NULL,
  "proposed_by_user_id" integer NOT NULL REFERENCES "portal_users"("id"),
  "proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "proposal_fingerprint" text NOT NULL,
  "decided_by_user_id" integer REFERENCES "portal_users"("id"),
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "decision_fingerprint" text,
  CONSTRAINT "academic_policy_versions_status_ck" CHECK ("status" IN ('proposed', 'approved', 'rejected', 'withdrawn', 'stale')),
  CONSTRAINT "academic_policy_versions_values_ck" CHECK ("extra_load_threshold_credits" >= 0 AND "extra_class_rate" >= 0 AND "theory_attendance_marks" >= 0 AND "sessional_attendance_marks" >= 0),
  CONSTRAINT "academic_policy_versions_reason_ck" CHECK (char_length("reason") >= 1 AND char_length("reason") <= 500 AND "reason" = btrim("reason")),
  CONSTRAINT "academic_policy_versions_note_ck" CHECK ("decision_note" IS NULL OR (char_length("decision_note") >= 1 AND char_length("decision_note") <= 500 AND "decision_note" = btrim("decision_note"))),
  CONSTRAINT "academic_policy_versions_version_ck" CHECK (("status" = 'approved') = ("version" IS NOT NULL) AND ("version" IS NULL OR "version" >= 1)),
  CONSTRAINT "academic_policy_versions_decision_ck" CHECK (
    ("status" = 'proposed' AND "decided_at" IS NULL AND "decided_by_user_id" IS NULL AND "decision_note" IS NULL AND "decision_fingerprint" IS NULL)
    OR ("status" IN ('approved', 'rejected', 'withdrawn') AND "decided_at" IS NOT NULL AND "decided_by_user_id" IS NOT NULL)
    OR ("status" = 'stale' AND "decided_at" IS NOT NULL)),
  CONSTRAINT "academic_policy_versions_approved_ck" CHECK ("status" <> 'approved' OR ("decision_fingerprint" IS NOT NULL AND "decided_by_user_id" <> "proposed_by_user_id")),
  CONSTRAINT "academic_policy_versions_rejected_ck" CHECK ("status" <> 'rejected' OR ("decision_note" IS NOT NULL AND "decided_by_user_id" <> "proposed_by_user_id"))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "academic_policy_versions_term_idx" ON "academic_policy_versions" ("term_id", "effective_from");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_policy_versions_open_uq" ON "academic_policy_versions" ("term_id") WHERE "status" = 'proposed';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_policy_versions_date_uq" ON "academic_policy_versions" ("term_id", "effective_from") WHERE "status" = 'approved';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "academic_policy_versions_number_uq" ON "academic_policy_versions" ("term_id", "version");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "academic_policy_versions_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'academic_policy_versions rows are append-only' USING ERRCODE = 'check_violation'; END IF;
  IF OLD."status" <> 'proposed' THEN RAISE EXCEPTION 'a decided academic policy version is immutable' USING ERRCODE = 'check_violation'; END IF;
  IF NEW."term_id" <> OLD."term_id" OR NEW."effective_from" <> OLD."effective_from" OR NEW."reason" <> OLD."reason"
    OR NEW."extra_load_threshold_credits" <> OLD."extra_load_threshold_credits" OR NEW."extra_class_rate" <> OLD."extra_class_rate"
    OR NEW."theory_attendance_marks" <> OLD."theory_attendance_marks" OR NEW."sessional_attendance_marks" <> OLD."sessional_attendance_marks"
    OR NEW."proposed_by_user_id" <> OLD."proposed_by_user_id" OR NEW."proposed_at" <> OLD."proposed_at" OR NEW."proposal_fingerprint" <> OLD."proposal_fingerprint" THEN
    RAISE EXCEPTION 'a proposal can only be decided, not edited' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "academic_policy_versions_guard_trg" ON "academic_policy_versions";
--> statement-breakpoint
CREATE TRIGGER "academic_policy_versions_guard_trg" BEFORE UPDATE OR DELETE ON "academic_policy_versions" FOR EACH ROW EXECUTE FUNCTION "academic_policy_versions_guard"();
