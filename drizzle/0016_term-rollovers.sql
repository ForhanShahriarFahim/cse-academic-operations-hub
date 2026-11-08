CREATE TABLE IF NOT EXISTS "term_rollovers" (
  "id" serial PRIMARY KEY,
  "source_term_id" integer NOT NULL REFERENCES "academic_terms"("id"),
  "target_term_id" integer NOT NULL UNIQUE REFERENCES "academic_terms"("id"),
  "actor_user_id" integer NOT NULL REFERENCES "portal_users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reason" text NOT NULL,
  "summary" jsonb NOT NULL,
  CONSTRAINT "term_rollovers_different_terms_ck" CHECK (source_term_id <> target_term_id)
);
