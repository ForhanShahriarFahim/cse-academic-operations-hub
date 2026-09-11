CREATE TABLE "academic_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"theory_credit_hours" numeric(4, 1) DEFAULT '3.0' NOT NULL,
	"sessional_credit_hours" numeric(4, 1) DEFAULT '2.0' NOT NULL,
	"extra_load_threshold_credits" numeric(4, 1) DEFAULT '15.0' NOT NULL,
	"extra_class_rate" numeric(10, 2) DEFAULT '200.00' NOT NULL,
	"theory_attendance_marks" numeric(4, 1) DEFAULT '10.0' NOT NULL,
	"sessional_attendance_marks" numeric(4, 1) DEFAULT '5.0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"status" text DEFAULT 'absent' NOT NULL,
	"note" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"teaching_group_id" integer NOT NULL,
	"teacher_id" integer,
	"meeting_id" integer,
	"class_date" date NOT NULL,
	"phase" text DEFAULT 'midterm' NOT NULL,
	"start_minutes" integer,
	"end_minutes" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"teaching_group_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"audience_type" text DEFAULT 'local' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extra_load_classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"teacher_id" integer NOT NULL,
	"teaching_group_id" integer,
	"class_date" date NOT NULL,
	"start_minutes" integer NOT NULL,
	"end_minutes" integer NOT NULL,
	"course_code_snapshot" text NOT NULL,
	"course_title_snapshot" text NOT NULL,
	"batch_label_snapshot" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extra_load_manual_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"term_id" integer NOT NULL,
	"teacher_name" text NOT NULL,
	"class_count" integer NOT NULL,
	"rate_override" numeric(10, 2),
	"amount_override" numeric(12, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_code" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"home_department_id" integer,
	"home_department_label" text,
	"home_batch_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "students_student_code_unique" UNIQUE("student_code")
);
--> statement-breakpoint
ALTER TABLE "permitted_windows" ADD COLUMN "term_id" integer;--> statement-breakpoint
ALTER TABLE "permitted_windows" ADD COLUMN "batch_id" integer;--> statement-breakpoint
ALTER TABLE "academic_policies" ADD CONSTRAINT "academic_policies_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_teaching_group_id_teaching_groups_id_fk" FOREIGN KEY ("teaching_group_id") REFERENCES "public"."teaching_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_teaching_group_id_teaching_groups_id_fk" FOREIGN KEY ("teaching_group_id") REFERENCES "public"."teaching_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_load_classes" ADD CONSTRAINT "extra_load_classes_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_load_classes" ADD CONSTRAINT "extra_load_classes_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_load_classes" ADD CONSTRAINT "extra_load_classes_teaching_group_id_teaching_groups_id_fk" FOREIGN KEY ("teaching_group_id") REFERENCES "public"."teaching_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_load_manual_summaries" ADD CONSTRAINT "extra_load_manual_summaries_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_home_department_id_departments_id_fk" FOREIGN KEY ("home_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_home_batch_id_batches_id_fk" FOREIGN KEY ("home_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_policies_term_uq" ON "academic_policies" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_uq" ON "attendance_records" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "attendance_records_student_idx" ON "attendance_records" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "attendance_sessions_group_date_idx" ON "attendance_sessions" USING btree ("teaching_group_id","class_date");--> statement-breakpoint
CREATE UNIQUE INDEX "course_enrollments_uq" ON "course_enrollments" USING btree ("term_id","teaching_group_id","student_id");--> statement-breakpoint
CREATE INDEX "course_enrollments_group_idx" ON "course_enrollments" USING btree ("teaching_group_id");--> statement-breakpoint
CREATE INDEX "extra_load_classes_teacher_date_idx" ON "extra_load_classes" USING btree ("teacher_id","class_date");--> statement-breakpoint
CREATE INDEX "extra_load_classes_term_idx" ON "extra_load_classes" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "extra_load_manual_term_idx" ON "extra_load_manual_summaries" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "students_name_idx" ON "students" USING btree ("full_name");--> statement-breakpoint
ALTER TABLE "permitted_windows" ADD CONSTRAINT "permitted_windows_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permitted_windows" ADD CONSTRAINT "permitted_windows_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "academic_policies" (
  "term_id", "theory_credit_hours", "sessional_credit_hours",
  "extra_load_threshold_credits", "extra_class_rate",
  "theory_attendance_marks", "sessional_attendance_marks"
)
SELECT "id", '3.0', '2.0', '15.0', '200.00', '10.0', '5.0'
FROM "academic_terms"
ON CONFLICT ("term_id") DO NOTHING;
--> statement-breakpoint
UPDATE "permitted_windows"
SET "term_id" = (SELECT "id" FROM "academic_terms" WHERE "status" = 'active' ORDER BY "id" LIMIT 1)
WHERE "term_id" IS NULL;
--> statement-breakpoint
UPDATE "courses" SET "credits" = '2.0' WHERE "course_type" = 'sessional';
--> statement-breakpoint
UPDATE "rooms" SET "code" = '406', "room_type" = 'lab', "notes" = 'Computer laboratory; theory classes may use it when free.' WHERE "code" = 'NB-L1';
--> statement-breakpoint
UPDATE "rooms" SET "code" = '407', "room_type" = 'lab', "notes" = 'Computer laboratory; theory classes may use it when free.' WHERE "code" = 'NB-L2';
--> statement-breakpoint
UPDATE "rooms" SET "code" = '408', "room_type" = 'lab', "notes" = 'Computer laboratory; theory classes may use it when free.' WHERE "code" = 'NB-L3';
--> statement-breakpoint
UPDATE "rooms" SET "code" = '505', "room_type" = 'lab', "notes" = 'Specialist microprocessor and networking laboratory; theory classes may use it when free.' WHERE "code" = 'NB-505';
--> statement-breakpoint
UPDATE "rooms" SET "is_active" = false, "notes" = 'Legacy synthetic room; disabled pending confirmation.' WHERE "code" = 'NB-L4';
