CREATE TABLE "academic_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"academic_year" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"effective_from" date,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"actor" text DEFAULT 'coordinator' NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "batch_term_placements" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"term_id" integer NOT NULL,
	"semester" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"stream" text NOT NULL,
	"label" text NOT NULL,
	"intake" text,
	"status" text DEFAULT 'active' NOT NULL,
	"student_count" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT 'institution' NOT NULL,
	"stream" text,
	"day_of_week" integer,
	"start_minutes" integer NOT NULL,
	"end_minutes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_offerings" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"term_id" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"credits" numeric(4, 1) NOT NULL,
	"course_type" text DEFAULT 'theory' NOT NULL,
	"owning_department_id" integer,
	"semester" integer NOT NULL,
	"needs_lab" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "courses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "external_commitments" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"kind" text NOT NULL,
	"completeness_level" text DEFAULT 'D' NOT NULL,
	"counterpart_department" text NOT NULL,
	"teacher_id" integer,
	"room_id" integer,
	"course_label" text,
	"audience_label" text,
	"day_of_week" integer,
	"start_minutes" integer,
	"end_minutes" integer,
	"credits" numeric(4, 1),
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"source" text,
	"last_verified_at" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "meeting_rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer NOT NULL,
	"room_id" integer NOT NULL,
	"room_role" text DEFAULT 'primary' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_teachers" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer NOT NULL,
	"teacher_id" integer NOT NULL,
	"role" text DEFAULT 'instructor' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"teaching_group_id" integer NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_minutes" integer NOT NULL,
	"end_minutes" integer NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"is_exception" boolean DEFAULT false NOT NULL,
	"exception_note" text,
	"custom_time_label" text,
	"highlight_color" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permitted_windows" (
	"id" serial PRIMARY KEY NOT NULL,
	"stream" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_minutes" integer NOT NULL,
	"end_minutes" integer NOT NULL,
	"requires_exception_note" text
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"building" text NOT NULL,
	"room_type" text DEFAULT 'classroom' NOT NULL,
	"capacity" integer,
	"owning_department_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	CONSTRAINT "rooms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "schedule_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"published_at" timestamp,
	"published_by" text,
	"change_summary" text,
	"snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" serial PRIMARY KEY NOT NULL,
	"short_code" text NOT NULL,
	"full_name" text NOT NULL,
	"designation" text,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"home_department_id" integer,
	"email" text,
	"phone_private" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	CONSTRAINT "teachers_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "teaching_group_offerings" (
	"id" serial PRIMARY KEY NOT NULL,
	"teaching_group_id" integer NOT NULL,
	"offering_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"delivery_mode" text DEFAULT 'fixed' NOT NULL,
	"external_audience_label" text,
	"external_student_count" integer,
	"pending_reconciliation" boolean DEFAULT false NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "teaching_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"teaching_group_id" integer NOT NULL,
	"expected_weekly_minutes" integer,
	"required_meetings_per_week" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "workload_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"teacher_id" integer NOT NULL,
	"term_id" integer NOT NULL,
	"teaching_group_id" integer,
	"external_commitment_id" integer,
	"units" numeric(5, 2) NOT NULL,
	"allocation_method" text DEFAULT 'sole' NOT NULL,
	"policy_note" text
);
--> statement-breakpoint
ALTER TABLE "batch_term_placements" ADD CONSTRAINT "batch_term_placements_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_term_placements" ADD CONSTRAINT "batch_term_placements_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_owning_department_id_departments_id_fk" FOREIGN KEY ("owning_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_commitments" ADD CONSTRAINT "external_commitments_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_commitments" ADD CONSTRAINT "external_commitments_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_commitments" ADD CONSTRAINT "external_commitments_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_teachers" ADD CONSTRAINT "meeting_teachers_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_teachers" ADD CONSTRAINT "meeting_teachers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_teaching_group_id_teaching_groups_id_fk" FOREIGN KEY ("teaching_group_id") REFERENCES "public"."teaching_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owning_department_id_departments_id_fk" FOREIGN KEY ("owning_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_versions" ADD CONSTRAINT "schedule_versions_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_home_department_id_departments_id_fk" FOREIGN KEY ("home_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_group_offerings" ADD CONSTRAINT "teaching_group_offerings_teaching_group_id_teaching_groups_id_fk" FOREIGN KEY ("teaching_group_id") REFERENCES "public"."teaching_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_group_offerings" ADD CONSTRAINT "teaching_group_offerings_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_groups" ADD CONSTRAINT "teaching_groups_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_groups" ADD CONSTRAINT "teaching_groups_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_requirements" ADD CONSTRAINT "teaching_requirements_teaching_group_id_teaching_groups_id_fk" FOREIGN KEY ("teaching_group_id") REFERENCES "public"."teaching_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_allocations" ADD CONSTRAINT "workload_allocations_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_allocations" ADD CONSTRAINT "workload_allocations_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_allocations" ADD CONSTRAINT "workload_allocations_teaching_group_id_teaching_groups_id_fk" FOREIGN KEY ("teaching_group_id") REFERENCES "public"."teaching_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_allocations" ADD CONSTRAINT "workload_allocations_external_commitment_id_external_commitments_id_fk" FOREIGN KEY ("external_commitment_id") REFERENCES "public"."external_commitments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "btp_uq" ON "batch_term_placements" USING btree ("batch_id","term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_stream_label_uq" ON "batches" USING btree ("stream","label");--> statement-breakpoint
CREATE UNIQUE INDEX "offerings_uq" ON "course_offerings" USING btree ("course_id","batch_id","term_id");--> statement-breakpoint
CREATE INDEX "ec_term_idx" ON "external_commitments" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mr_uq" ON "meeting_rooms" USING btree ("meeting_id","room_id");--> statement-breakpoint
CREATE INDEX "mr_room_idx" ON "meeting_rooms" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mt_uq" ON "meeting_teachers" USING btree ("meeting_id","teacher_id","role");--> statement-breakpoint
CREATE INDEX "mt_teacher_idx" ON "meeting_teachers" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "meetings_day_idx" ON "meetings" USING btree ("day_of_week");--> statement-breakpoint
CREATE INDEX "meetings_tg_idx" ON "meetings" USING btree ("teaching_group_id");--> statement-breakpoint
CREATE INDEX "rooms_building_idx" ON "rooms" USING btree ("building");--> statement-breakpoint
CREATE INDEX "teachers_dept_idx" ON "teachers" USING btree ("home_department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tgo_uq" ON "teaching_group_offerings" USING btree ("teaching_group_id","offering_id");--> statement-breakpoint
CREATE INDEX "tgo_offering_idx" ON "teaching_group_offerings" USING btree ("offering_id");--> statement-breakpoint
CREATE INDEX "tg_term_idx" ON "teaching_groups" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "wa_teacher_idx" ON "workload_allocations" USING btree ("teacher_id");