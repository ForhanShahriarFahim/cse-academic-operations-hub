CREATE TABLE IF NOT EXISTS "portal_users" (
  "id" serial PRIMARY KEY,
  "email" text NOT NULL UNIQUE,
  "display_name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'invited',
  "teacher_id" integer REFERENCES "teachers"("id"),
  "last_login_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_users_teacher_idx" ON "portal_users" ("teacher_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portal_users_email_normalized_uq" ON "portal_users" (lower("email"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_assignments" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "portal_users"("id"),
  "role" text NOT NULL,
  "department_id" integer REFERENCES "departments"("id"),
  "active_from" timestamp NOT NULL DEFAULT now(),
  "active_to" timestamp,
  "granted_by_user_id" integer REFERENCES "portal_users"("id"),
  "granted_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_assignments_user_idx" ON "role_assignments" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean NOT NULL DEFAULT false,
  "image" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_session" (
  "id" text PRIMARY KEY,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "auth_user"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_session_user_idx" ON "auth_session" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_account" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "auth_user"("id"),
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_account_provider_uq" ON "auth_account" ("provider_id", "account_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_verification_identifier_idx" ON "auth_verification" ("identifier");
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "actor_user_id" integer REFERENCES "portal_users"("id");
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "actor_display_name" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "actor_kind" text NOT NULL DEFAULT 'system';
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "request_id" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "before" jsonb;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN IF NOT EXISTS "after" jsonb;
