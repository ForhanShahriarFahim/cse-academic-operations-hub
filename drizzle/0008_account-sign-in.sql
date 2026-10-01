-- AUTH-02 (#36): email/password sign-in and account administration.
-- Forward-only and additive. Existing accounts keep Google only (google_enabled
-- defaults to true, password_enabled to false), so nobody's access changes.
ALTER TABLE "portal_users"
  ADD COLUMN IF NOT EXISTS "password_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "google_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "failed_sign_ins" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "portal_users"
  ADD CONSTRAINT "portal_users_sign_in_method_ck" CHECK ("password_enabled" OR "google_enabled");
--> statement-breakpoint
-- One-time setup and reset links. Only a SHA-256 hash of the token is stored.
CREATE TABLE IF NOT EXISTS "account_links" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "portal_users"("id"),
  "purpose" text NOT NULL CHECK ("purpose" IN ('setup', 'reset')),
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "issued_by_user_id" integer REFERENCES "portal_users"("id"),
  "issued_at" timestamp with time zone NOT NULL DEFAULT now(),
  "used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_links_user_idx" ON "account_links" ("user_id");
--> statement-breakpoint
-- At most one link per person that is neither used nor revoked. Issuing a new
-- one revokes the old one first, even if it has already expired.
CREATE UNIQUE INDEX IF NOT EXISTS "account_links_one_open_uq" ON "account_links" ("user_id")
  WHERE "used_at" IS NULL AND "revoked_at" IS NULL;
--> statement-breakpoint
-- How the session was created. Sessions from before AUTH-02 have none; they
-- could only have come from Google.
ALTER TABLE "auth_session"
  ADD COLUMN IF NOT EXISTS "sign_in_method" text CHECK ("sign_in_method" IN ('password', 'google'));
