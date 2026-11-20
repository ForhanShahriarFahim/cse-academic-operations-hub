-- Preserve existing commitments as whole-term standalone records.
ALTER TABLE "external_commitments"
  ADD COLUMN IF NOT EXISTS "effective_from" date,
  ADD COLUMN IF NOT EXISTS "effective_to" date,
  ADD COLUMN IF NOT EXISTS "linked_teaching_group_id" integer,
  ADD COLUMN IF NOT EXISTS "carried_from_term_id" integer REFERENCES "academic_terms" ("id"),
  ADD COLUMN IF NOT EXISTS "carried_from_commitment_id" integer;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tg_term_id_uq" ON "teaching_groups" ("term_id", "id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ec_linked_group_fk' AND conrelid = 'external_commitments'::regclass) THEN
    ALTER TABLE "external_commitments" ADD CONSTRAINT "ec_linked_group_fk" FOREIGN KEY ("term_id", "linked_teaching_group_id")
      REFERENCES "teaching_groups" ("term_id", "id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ec_effective_range_ck' AND conrelid = 'external_commitments'::regclass) THEN
    ALTER TABLE "external_commitments" ADD CONSTRAINT "ec_effective_range_ck" CHECK (
      ("effective_from" IS NULL AND "effective_to" IS NULL) OR
      ("effective_from" IS NOT NULL AND "effective_to" IS NOT NULL AND "effective_from" <= "effective_to" AND "kind" <> 'unresolved_note')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ec_carry_origin_ck' AND conrelid = 'external_commitments'::regclass) THEN
    ALTER TABLE "external_commitments" ADD CONSTRAINT "ec_carry_origin_ck" CHECK (
      ("carried_from_term_id" IS NULL AND "carried_from_commitment_id" IS NULL) OR
      ("carried_from_term_id" IS NOT NULL AND "carried_from_term_id" <> "term_id" AND "carried_from_commitment_id" IS NOT NULL AND "carried_from_commitment_id" > 0)
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ec_linked_group_idx" ON "external_commitments" ("term_id", "linked_teaching_group_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ec_carry_origin_uq" ON "external_commitments" ("term_id", "carried_from_commitment_id");
