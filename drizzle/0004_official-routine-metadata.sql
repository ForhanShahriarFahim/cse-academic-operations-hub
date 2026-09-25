CREATE TABLE "class_representatives" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"full_name" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "class_representatives_term_batch_uq" UNIQUE("term_id","batch_id")
);
--> statement-breakpoint
CREATE TABLE "department_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"full_name" text NOT NULL,
	"designation" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"purpose" text DEFAULT 'routine_query' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_source_reconciliations" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"source_label" text NOT NULL,
	"detail" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_representatives" ADD CONSTRAINT "class_representatives_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_representatives" ADD CONSTRAINT "class_representatives_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "department_contacts" ADD CONSTRAINT "department_contacts_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "routine_source_reconciliations" ADD CONSTRAINT "routine_source_reconciliations_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "department_contacts_term_idx" ON "department_contacts" USING btree ("term_id");
--> statement-breakpoint
CREATE INDEX "routine_source_reconciliations_term_idx" ON "routine_source_reconciliations" USING btree ("term_id");
