import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  numeric,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Pundra Academic Operations Portal — relational application schema.
 *
 * Implements the corrected v2.0 specification:
 * - Streams (HSC / Diploma) are explicit, never inferred.
 * - Shared classes are stored once (one meeting per physical event).
 * - Exact minute-based times are authoritative; slots are display conveniences.
 * - External (OD) commitments are structured records with completeness levels.
 * - Published versions are immutable snapshots.
 */

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});

export const rooms = pgTable(
  "rooms",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    building: text("building").notNull(),
    roomType: text("room_type").notNull().default("classroom"), // classroom | lab
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    capacity: integer("capacity"), // null = unknown (never treated as zero)
    owningDepartmentId: integer("owning_department_id").references(() => departments.id),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
  },
  (t) => [index("rooms_building_idx").on(t.building)],
);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const teachers = pgTable(
  "teachers",
  {
    id: serial("id").primaryKey(),
    // Short codes are exact identifiers — never matched by substring (IM != IMN).
    shortCode: text("short_code").notNull().unique(),
    fullName: text("full_name").notNull(),
    designation: text("designation"),
    employmentType: text("employment_type").notNull().default("full_time"),
    homeDepartmentId: integer("home_department_id").references(() => departments.id),
    email: text("email"),
    phonePrivate: text("phone_private"), // restricted visibility
    status: text("status").notNull().default("active"),
    notes: text("notes"),
  },
  (t) => [index("teachers_dept_idx").on(t.homeDepartmentId)],
);

// Portal authorization is deliberately separate from academic teacher records.
// Better Auth owns auth_* identity/session tables; invitation and permissions
// remain application data so a provider change does not change academic roles.
export const portalUsers = pgTable("portal_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("invited"),
  teacherId: integer("teacher_id").references(() => teachers.id),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("portal_users_teacher_idx").on(t.teacherId)]);

export const roleAssignments = pgTable("role_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => portalUsers.id),
  role: text("role").notNull(),
  departmentId: integer("department_id").references(() => departments.id),
  activeFrom: timestamp("active_from").notNull().defaultNow(),
  activeTo: timestamp("active_to"),
  grantedByUserId: integer("granted_by_user_id").references(() => portalUsers.id),
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
}, (t) => [index("role_assignments_user_idx").on(t.userId)]);

export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const authSession = pgTable("auth_session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => authUser.id),
}, (t) => [index("auth_session_user_idx").on(t.userId)]);

export const authAccount = pgTable("auth_account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => authUser.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("auth_account_provider_uq").on(t.providerId, t.accountId)]);

export const authVerification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("auth_verification_identifier_idx").on(t.identifier)]);

// ---------------------------------------------------------------------------
// Academic structure
// ---------------------------------------------------------------------------

export const academicTerms = pgTable("academic_terms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // e.g. "Summer 2026" — an academic term, not semester #6
  academicYear: integer("academic_year").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  effectiveFrom: date("effective_from"), // printed routine effective date
  status: text("status").notNull().default("active"),
});

// Policy values are term-scoped so Spring/Summer sessions can change without
// rewriting historical marks or payment calculations.
export const academicPolicies = pgTable(
  "academic_policies",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    theoryCreditHours: numeric("theory_credit_hours", { precision: 4, scale: 1 }).notNull().default("3.0"),
    sessionalCreditHours: numeric("sessional_credit_hours", { precision: 4, scale: 1 }).notNull().default("2.0"),
    extraLoadThresholdCredits: numeric("extra_load_threshold_credits", { precision: 4, scale: 1 }).notNull().default("15.0"),
    extraClassRate: numeric("extra_class_rate", { precision: 10, scale: 2 }).notNull().default("200.00"),
    theoryAttendanceMarks: numeric("theory_attendance_marks", { precision: 4, scale: 1 }).notNull().default("10.0"),
    sessionalAttendanceMarks: numeric("sessional_attendance_marks", { precision: 4, scale: 1 }).notNull().default("5.0"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("academic_policies_term_uq").on(t.termId)],
);

export const batches = pgTable(
  "batches",
  {
    id: serial("id").primaryKey(),
    stream: text("stream").notNull(), // HSC | DIPLOMA
    label: text("label").notNull(), // e.g. "22B" — same number can exist in both streams
    intake: text("intake"),
    status: text("status").notNull().default("active"),
    studentCount: integer("student_count"), // null = unknown, unknown is not zero
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("batches_stream_label_uq").on(t.stream, t.label)],
);

export const batchTermPlacements = pgTable(
  "batch_term_placements",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id").notNull().references(() => batches.id),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    semester: integer("semester").notNull(), // 1..8, historical — never overwritten
  },
  (t) => [uniqueIndex("btp_uq").on(t.batchId, t.termId)],
);

export const classRepresentatives = pgTable(
  "class_representatives",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    batchId: integer("batch_id").notNull().references(() => batches.id),
    fullName: text("full_name"),
    phone: text("phone"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("class_representatives_term_batch_uq").on(t.termId, t.batchId)],
);

export const departmentContacts = pgTable(
  "department_contacts",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    fullName: text("full_name").notNull(),
    designation: text("designation").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    purpose: text("purpose").notNull().default("routine_query"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("department_contacts_term_idx").on(t.termId)],
);

export const routineSourceReconciliations = pgTable(
  "routine_source_reconciliations",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    sourceLabel: text("source_label").notNull(),
    detail: text("detail").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("routine_source_reconciliations_term_idx").on(t.termId)],
);

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // e.g. CSE-1101, CSE-4000(A) — suffixes preserved
  title: text("title").notNull(),
  credits: numeric("credits", { precision: 4, scale: 1 }).notNull(),
  courseType: text("course_type").notNull().default("theory"), // theory | sessional | thesis
  owningDepartmentId: integer("owning_department_id").references(() => departments.id),
  semester: integer("semester").notNull(), // curriculum placement, not derived from code digits
  needsLab: boolean("needs_lab").notNull().default(false),
  requiredRoomCapability: text("required_room_capability"),
  isActive: boolean("is_active").notNull().default(true),
});

// ---------------------------------------------------------------------------
// Course offerings and teaching groups
// ---------------------------------------------------------------------------

export const courseOfferings = pgTable(
  "course_offerings",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull().references(() => courses.id),
    batchId: integer("batch_id").notNull().references(() => batches.id),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    status: text("status").notNull().default("open"), // planned | open | cancelled | completed
  },
  (t) => [uniqueIndex("offerings_uq").on(t.courseId, t.batchId, t.termId)],
);

export const teachingGroups = pgTable(
  "teaching_groups",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    courseId: integer("course_id").notNull().references(() => courses.id),
    deliveryMode: text("delivery_mode").notNull().default("fixed"), // fixed | teacher_managed
    // External audience label (e.g. "EEE-22B") when students from another dept attend.
    externalAudienceLabel: text("external_audience_label"),
    externalStudentCount: integer("external_student_count"), // null = unknown
    pendingReconciliation: boolean("pending_reconciliation").notNull().default(false),
    notes: text("notes"),
  },
  (t) => [index("tg_term_idx").on(t.termId)],
);

// A teaching group can serve several offerings (merged classes across
// streams/batches/departments). Membership is relational, never derived
// from display labels.
export const teachingGroupOfferings = pgTable(
  "teaching_group_offerings",
  {
    id: serial("id").primaryKey(),
    teachingGroupId: integer("teaching_group_id").notNull().references(() => teachingGroups.id),
    offeringId: integer("offering_id").notNull().references(() => courseOfferings.id),
  },
  (t) => [
    uniqueIndex("tgo_uq").on(t.teachingGroupId, t.offeringId),
    index("tgo_offering_idx").on(t.offeringId),
  ],
);

export const teachingRequirements = pgTable("teaching_requirements", {
  id: serial("id").primaryKey(),
  teachingGroupId: integer("teaching_group_id").notNull().references(() => teachingGroups.id),
  expectedWeeklyMinutes: integer("expected_weekly_minutes"), // null for teacher-managed
  requiredMeetingsPerWeek: integer("required_meetings_per_week").notNull().default(2),
  status: text("status").notNull().default("approved"), // approved | provisional
  notes: text("notes"),
});

// ---------------------------------------------------------------------------
// Meetings (the canonical physical class events)
// ---------------------------------------------------------------------------

export const meetings = pgTable(
  "meetings",
  {
    id: serial("id").primaryKey(),
    teachingGroupId: integer("teaching_group_id").notNull().references(() => teachingGroups.id),
    dayOfWeek: integer("day_of_week").notNull(), // 0=Saturday ... 6=Friday (BD academic week)
    startMinutes: integer("start_minutes").notNull(), // minutes since midnight, authoritative
    endMinutes: integer("end_minutes").notNull(),
    effectiveFrom: date("effective_from"), // null = whole term
    effectiveTo: date("effective_to"),
    isException: boolean("is_exception").notNull().default(false), // approved window exception
    exceptionNote: text("exception_note"),
    customTimeLabel: text("custom_time_label"), // e.g. "10:00–11:15 AM*" — display only
    highlightColor: text("highlight_color"), // source highlight preserved; meaning unconfirmed
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("meetings_day_idx").on(t.dayOfWeek),
    index("meetings_tg_idx").on(t.teachingGroupId),
  ],
);

export const meetingTeachers = pgTable(
  "meeting_teachers",
  {
    id: serial("id").primaryKey(),
    meetingId: integer("meeting_id").notNull().references(() => meetings.id),
    teacherId: integer("teacher_id").notNull().references(() => teachers.id),
    role: text("role").notNull().default("instructor"), // instructor | co_teacher | substitute
  },
  (t) => [
    uniqueIndex("mt_uq").on(t.meetingId, t.teacherId, t.role),
    index("mt_teacher_idx").on(t.teacherId),
  ],
);

export const meetingRooms = pgTable(
  "meeting_rooms",
  {
    id: serial("id").primaryKey(),
    meetingId: integer("meeting_id").notNull().references(() => meetings.id),
    roomId: integer("room_id").notNull().references(() => rooms.id),
    roomRole: text("room_role").notNull().default("primary"), // primary | alternative | segment
  },
  (t) => [
    uniqueIndex("mr_uq").on(t.meetingId, t.roomId),
    index("mr_room_idx").on(t.roomId),
  ],
);

// ---------------------------------------------------------------------------
// Time policy
// ---------------------------------------------------------------------------

export const breakRules = pgTable("break_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  scope: text("scope").notNull().default("institution"), // institution | stream
  stream: text("stream"), // required when scope = stream
  dayOfWeek: integer("day_of_week"), // null = every day
  startMinutes: integer("start_minutes").notNull(),
  endMinutes: integer("end_minutes").notNull(),
});

// Term time grids (RUT-04). A pattern is a named list of periods and breaks;
// a day plan says which pattern a stream, or one batch, uses on a day. Class
// hours stay in permitted_windows. break_rules is kept only as history: terms
// read breaks from their patterns.
export const periodPatterns = pgTable(
  "period_patterns",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    name: text("name").notNull(),
    periods: jsonb("periods").$type<Array<{ start: number; end: number }>>().notNull().default([]),
    breaks: jsonb("breaks").$type<Array<{ name: string; start: number; end: number; blocksClasses: boolean }>>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("period_patterns_term_name_uq").on(t.termId, t.name)],
);

export const dayPlans = pgTable(
  "day_plans",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    stream: text("stream").notNull(), // HSC | DIPLOMA
    batchId: integer("batch_id").references(() => batches.id), // null = the stream's own plan
    dayOfWeek: integer("day_of_week").notNull(),
    patternId: integer("pattern_id").references(() => periodPatterns.id), // null = no classes (batch only)
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("day_plans_term_idx").on(t.termId)],
);

export const permittedWindows = pgTable("permitted_windows", {
  id: serial("id").primaryKey(),
  termId: integer("term_id").references(() => academicTerms.id),
  batchId: integer("batch_id").references(() => batches.id),
  stream: text("stream").notNull(), // HSC | DIPLOMA
  dayOfWeek: integer("day_of_week").notNull(),
  startMinutes: integer("start_minutes").notNull(),
  endMinutes: integer("end_minutes").notNull(),
  requiresExceptionNote: text("requires_exception_note"), // e.g. HSC Friday policy pending
});

// ---------------------------------------------------------------------------
// Student enrollment and attendance
// ---------------------------------------------------------------------------

export const students = pgTable(
  "students",
  {
    id: serial("id").primaryKey(),
    studentCode: text("student_code").notNull().unique(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    homeDepartmentId: integer("home_department_id").references(() => departments.id),
    homeDepartmentLabel: text("home_department_label"),
    homeBatchId: integer("home_batch_id").references(() => batches.id),
    status: text("status").notNull().default("active"), // active | inactive
    notes: text("notes"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("students_name_idx").on(t.fullName)],
);

// Enrollment is independent of a student's home department/batch. This is
// the seam that supports merged classes and students from other departments.
export const courseEnrollments = pgTable(
  "course_enrollments",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    teachingGroupId: integer("teaching_group_id").notNull().references(() => teachingGroups.id),
    studentId: integer("student_id").notNull().references(() => students.id),
    audienceType: text("audience_type").notNull().default("local"), // local | external | merged
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("course_enrollments_uq").on(t.termId, t.teachingGroupId, t.studentId),
    index("course_enrollments_group_idx").on(t.teachingGroupId),
  ],
);

export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    teachingGroupId: integer("teaching_group_id").notNull().references(() => teachingGroups.id),
    teacherId: integer("teacher_id").references(() => teachers.id),
    meetingId: integer("meeting_id").references(() => meetings.id),
    classDate: date("class_date").notNull(),
    phase: text("phase").notNull().default("midterm"), // midterm | final
    startMinutes: integer("start_minutes"),
    endMinutes: integer("end_minutes"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("attendance_sessions_group_date_idx").on(t.teachingGroupId, t.classDate)],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull().references(() => attendanceSessions.id),
    studentId: integer("student_id").notNull().references(() => students.id),
    status: text("status").notNull().default("absent"), // present | absent | late | excused
    note: text("note"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attendance_records_uq").on(t.sessionId, t.studentId),
    index("attendance_records_student_idx").on(t.studentId),
  ],
);

// ---------------------------------------------------------------------------
// Extra class load and honorarium
// ---------------------------------------------------------------------------

export const extraLoadClasses = pgTable(
  "extra_load_classes",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    teacherId: integer("teacher_id").notNull().references(() => teachers.id),
    teachingGroupId: integer("teaching_group_id").references(() => teachingGroups.id),
    classDate: date("class_date").notNull(),
    startMinutes: integer("start_minutes").notNull(),
    endMinutes: integer("end_minutes").notNull(),
    courseCodeSnapshot: text("course_code_snapshot").notNull(),
    courseTitleSnapshot: text("course_title_snapshot").notNull(),
    batchLabelSnapshot: text("batch_label_snapshot").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("extra_load_classes_teacher_date_idx").on(t.teacherId, t.classDate),
    index("extra_load_classes_term_idx").on(t.termId),
  ],
);

// Manual summaries are deliberately separate from app-recorded classes. They
// allow top-sheet inclusion without inventing teacher accounts or attendance.
export const extraLoadManualSummaries = pgTable(
  "extra_load_manual_summaries",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    teacherName: text("teacher_name").notNull(),
    classCount: integer("class_count").notNull(),
    rateOverride: numeric("rate_override", { precision: 10, scale: 2 }),
    amountOverride: numeric("amount_override", { precision: 12, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("extra_load_manual_term_idx").on(t.termId)],
);

// ---------------------------------------------------------------------------
// External commitments (the OD row data model)
// ---------------------------------------------------------------------------

export const externalCommitments = pgTable(
  "external_commitments",
  {
    id: serial("id").primaryKey(),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    // teaching | room_reservation | combined | unresolved_note
    kind: text("kind").notNull(),
    completenessLevel: text("completeness_level").notNull().default("D"), // A | B | C | D
    counterpartDepartment: text("counterpart_department").notNull(),
    teacherId: integer("teacher_id").references(() => teachers.id), // null when unknown
    roomId: integer("room_id").references(() => rooms.id), // null when unknown
    courseLabel: text("course_label"),
    audienceLabel: text("audience_label"),
    dayOfWeek: integer("day_of_week"), // null for unresolved notes
    startMinutes: integer("start_minutes"),
    endMinutes: integer("end_minutes"),
    credits: numeric("credits", { precision: 4, scale: 1 }),
    verificationStatus: text("verification_status").notNull().default("pending"), // pending | verified
    source: text("source"),
    lastVerifiedAt: timestamp("last_verified_at"),
    notes: text("notes"),
  },
  (t) => [index("ec_term_idx").on(t.termId)],
);

// Workload is an explicit allocation record — never computed by summing
// timetable cells or course credits ad hoc.
export const workloadAllocations = pgTable(
  "workload_allocations",
  {
    id: serial("id").primaryKey(),
    teacherId: integer("teacher_id").notNull().references(() => teachers.id),
    termId: integer("term_id").notNull().references(() => academicTerms.id),
    teachingGroupId: integer("teaching_group_id").references(() => teachingGroups.id),
    externalCommitmentId: integer("external_commitment_id").references(() => externalCommitments.id),
    units: numeric("units", { precision: 5, scale: 2 }).notNull(),
    allocationMethod: text("allocation_method").notNull().default("sole"), // sole | shared_policy | split | external
    policyNote: text("policy_note"),
  },
  (t) => [index("wa_teacher_idx").on(t.teacherId)],
);

// ---------------------------------------------------------------------------
// Publication governance
// ---------------------------------------------------------------------------

export const scheduleVersions = pgTable("schedule_versions", {
  id: serial("id").primaryKey(),
  termId: integer("term_id").notNull().references(() => academicTerms.id),
  versionNumber: integer("version_number").notNull(),
  state: text("state").notNull().default("draft"), // draft | published | superseded
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  publishedAt: timestamp("published_at"),
  publishedBy: text("published_by"),
  changeSummary: text("change_summary"),
  snapshot: jsonb("snapshot"), // immutable meeting snapshot when published
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at").notNull().defaultNow(),
    actor: text("actor").notNull().default("coordinator"),
    actorUserId: integer("actor_user_id").references(() => portalUsers.id),
    actorDisplayName: text("actor_display_name"),
    actorKind: text("actor_kind").notNull().default("system"),
    requestId: text("request_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: integer("entity_id"),
    detail: jsonb("detail"),
  },
  (t) => [index("audit_at_idx").on(t.at)],
);
