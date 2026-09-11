/**
 * Synthetic development seed for the Summer 2026 CSE routine.
 *
 * Built strictly from the corrected v2.0 spec:
 * - HSC slots 09:30–10:45 / 10:45–12:00 / 12:00–13:15 / 14:30–15:45 (75 min).
 * - Diploma Friday class at 12:00–13:00, prayer break 13:00–14:00.
 * - HSC Saturday "12:00–14:30" is NOT a prayer break; cross-stream merged
 *   classes are flagged pendingReconciliation.
 * - OD row derives from structured external commitments (levels A–D).
 * - IM and IMN are distinct teachers.
 * - UT is a vacancy, never a fake teacher account.
 *
 * Run with: npx tsx src/db/seed.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  departments,
  teachers,
  rooms,
  academicTerms,
  academicPolicies,
  batches,
  batchTermPlacements,
  courses,
  courseOfferings,
  teachingGroups,
  teachingGroupOfferings,
  teachingRequirements,
  meetings,
  meetingTeachers,
  meetingRooms,
  breakRules,
  permittedWindows,
  externalCommitments,
  workloadAllocations,
  scheduleVersions,
  auditEvents,
  attendanceRecords,
  attendanceSessions,
  courseEnrollments,
  extraLoadClasses,
  extraLoadManualSummaries,
  students,
} from "./schema";
import { assembleMeetingViews, buildSnapshot } from "../lib/serialize";
import { HSC_SLOTS, DIPLOMA_FRIDAY_SLOTS, DIPLOMA_SATURDAY_SLOTS, TERM } from "../lib/constants";

// Deterministic PRNG so reseeds are stable.
let rngState = 20260814;
function rand(): number {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
}
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function seedDatabase() {
  console.log("Clearing existing data…");
  await db.execute(sql`
    TRUNCATE TABLE
      audit_events, schedule_versions, attendance_records, attendance_sessions,
      course_enrollments, extra_load_classes, extra_load_manual_summaries, students,
      academic_policies, workload_allocations,
      meeting_rooms, meeting_teachers, meetings,
      teaching_requirements, teaching_group_offerings, teaching_groups,
      course_offerings, batch_term_placements, courses, batches,
      permitted_windows, break_rules, external_commitments,
      academic_terms, rooms, teachers, departments
    RESTART IDENTITY CASCADE
  `);

  // -------------------------------- departments ----------------------------
  const deptRows = await db
    .insert(departments)
    .values([
      { code: "CSE", name: "Computer Science & Engineering" },
      { code: "MATH", name: "Mathematics" },
      { code: "PHY", name: "Physics" },
      { code: "ENG", name: "English" },
      { code: "EEE", name: "Electrical & Electronic Engineering" },
      { code: "PHAR", name: "Pharmacy" },
      { code: "BBA", name: "Business Administration" },
    ])
    .returning();
  const dept = Object.fromEntries(deptRows.map((d) => [d.code, d.id]));

  // -------------------------------- teachers -------------------------------
  // IM and IMN are deliberately distinct people (spec §3.3).
  const teacherSeed = [
    { shortCode: "NAK", fullName: "Dr. Nasima Akter", designation: "Professor", home: "CSE", email: "nasima.akter@example.edu" },
    { shortCode: "MRI", fullName: "Md. Rashedul Islam", designation: "Associate Professor", home: "CSE", email: "rashedul.islam@example.edu" },
    { shortCode: "TAH", fullName: "Tahmid Hasan", designation: "Assistant Professor", home: "CSE" },
    { shortCode: "SLM", fullName: "Salma Sultana", designation: "Assistant Professor", home: "CSE" },
    { shortCode: "FRH", fullName: "Farhana Haque", designation: "Lecturer", home: "CSE" },
    { shortCode: "KMH", fullName: "Md. Kamrul Hasan", designation: "Associate Professor", home: "CSE" },
    { shortCode: "JNF", fullName: "Jannatul Ferdous", designation: "Lecturer", home: "CSE" },
    { shortCode: "RBK", fullName: "Rubaiyat Karim", designation: "Lecturer", home: "CSE" },
    { shortCode: "SJD", fullName: "Sajid Ahmed", designation: "Lecturer", home: "CSE" },
    { shortCode: "MIM", fullName: "Mahmuda Islam", designation: "Assistant Professor", home: "CSE" },
    { shortCode: "IMN", fullName: "Imran Hossain", designation: "Lecturer", home: "CSE" },
    { shortCode: "IM", fullName: "Iftekhar Mahmud", designation: "Lecturer", home: "CSE" },
    { shortCode: "SAK", fullName: "Dr. Shirin Akhter", designation: "Professor", home: "MATH" },
    { shortCode: "RZK", fullName: "Md. Rezaul Karim", designation: "Associate Professor", home: "PHY" },
    { shortCode: "TNC", fullName: "Tasnim Chowdhury", designation: "Lecturer", home: "ENG" },
    { shortCode: "AHF", fullName: "Dr. Abu Hanif", designation: "Professor", home: "EEE" },
  ];
  const teacherRows = await db
    .insert(teachers)
    .values(
      teacherSeed.map((t) => ({
        shortCode: t.shortCode,
        fullName: t.fullName,
        designation: t.designation,
        homeDepartmentId: dept[t.home],
        email: t.email ?? null,
        phonePrivate: null,
        notes: t.home === "CSE" ? null : `Home department: ${t.home} — teaches CSE students (incoming teaching).`,
      })),
    )
    .returning();
  const T = Object.fromEntries(teacherRows.map((t) => [t.shortCode, t.id]));

  // -------------------------------- rooms ----------------------------------
  const roomRows = await db
    .insert(rooms)
    .values([
      ...[301, 302, 303, 304, 305, 306, 307, 308].map((n) => ({
        code: `NB-${n}`,
        building: "New Building",
        roomType: "classroom",
        capabilities: ["theory"],
        capacity: 70,
        owningDepartmentId: dept.CSE,
      })),
      { code: "505", building: "New Building", roomType: "lab", capabilities: ["computer", "microprocessor", "networking", "theory"], capacity: 130, owningDepartmentId: dept.CSE, notes: "Computer laboratory equipped for specialist microprocessor and networking work; theory classes may use it when free." },
      ...[406, 407, 408].map((n) => ({
        code: String(n),
        building: "New Building",
        roomType: "lab",
        capabilities: ["computer", "theory"],
        capacity: 65,
        owningDepartmentId: dept.CSE,
        notes: "Computer laboratory; theory classes may use it when free.",
      })),
      { code: "MB-201", building: "Main Building", roomType: "classroom", capabilities: ["theory"], capacity: 60, owningDepartmentId: dept.MATH },
      { code: "EEE-303", building: "EEE Building", roomType: "classroom", capabilities: ["theory"], capacity: 72, owningDepartmentId: dept.EEE },
    ])
    .returning();

  const R = Object.fromEntries(roomRows.map((r) => [r.code, r.id]));
  const roomMeta = new Map(roomRows.map((r) => [r.id, r]));

  // -------------------------------- term -----------------------------------
  const [term] = await db
    .insert(academicTerms)
    .values({
      name: TERM.name,
      academicYear: TERM.academicYear,
      startDate: TERM.startDate,
      endDate: TERM.endDate,
      effectiveFrom: TERM.effectiveFrom,
      status: "active",
    })
    .returning();

  await db.insert(academicPolicies).values({
    termId: term.id,
    theoryCreditHours: "3.0",
    sessionalCreditHours: "2.0",
    extraLoadThresholdCredits: "15.0",
    extraClassRate: "200.00",
    theoryAttendanceMarks: "10.0",
    sessionalAttendanceMarks: "5.0",
  });

  // -------------------------------- batches --------------------------------
  const hscSem: Record<string, number> = { "29B": 1, "28B": 2, "27B": 3, "26B": 4, "25B": 5, "24B": 6, "23B": 7, "22B": 8 };
  const dipSem: Record<string, number> = { "23B": 1, "22B": 2, "21B": 3, "20B": 4, "19B": 5, "18B": 6, "17B": 7, "16B": 8 };
  const hscCount: Record<string, number | null> = { "29B": 55, "28B": 52, "27B": 60, "26B": 48, "25B": 42, "24B": 38, "23B": 30, "22B": 26 };
  const dipCount: Record<string, (number | null)> = { "23B": 48, "22B": 44, "21B": 50, "20B": 40, "19B": 36, "18B": null, "17B": 22, "16B": 18 };

  const batchRows = await db
    .insert(batches)
    .values([
      ...Object.keys(hscSem).map((label, i) => ({
        stream: "HSC", label, intake: `HSC intake ${label.replace("B", "")}`,
        studentCount: hscCount[label] ?? null, sortOrder: 100 - i,
      })),
      ...Object.keys(dipSem).map((label, i) => ({
        stream: "DIPLOMA", label, intake: `Diploma intake ${label.replace("B", "")}`,
        studentCount: dipCount[label] ?? null, sortOrder: 100 - i,
      })),
    ])
    .returning();
  const B: Record<string, number> = {};
  for (const b of batchRows) B[`${b.stream}|${b.label}`] = b.id;

  await db.insert(batchTermPlacements).values(
    batchRows.map((b) => ({
      batchId: b.id,
      termId: term.id,
      semester: b.stream === "HSC" ? hscSem[b.label] : dipSem[b.label],
    })),
  );
  const semOf = (stream: string, label: number | string) =>
    stream === "HSC" ? hscSem[label as string] : dipSem[label as string];

  // -------------------------------- courses --------------------------------
  type CourseSeed = [code: string, title: string, credits: string, type: string, dept: string, sem: number, lab: boolean];
  const courseSeed: CourseSeed[] = [
    ["CSE-1101", "Structured Programming Language", "3.0", "theory", "CSE", 1, false],
    ["CSE-1102", "Structured Programming Language Sessional", "2.0", "sessional", "CSE", 1, true],
    ["MATH-1101", "Differential and Integral Calculus", "3.0", "theory", "MATH", 1, false],
    ["PHY-1101", "Physics", "3.0", "theory", "PHY", 1, false],
    ["ENG-1101", "Technical English", "3.0", "theory", "ENG", 1, false],
    ["CSE-1201", "Object Oriented Programming", "3.0", "theory", "CSE", 2, false],
    ["CSE-1202", "Object Oriented Programming Sessional", "2.0", "sessional", "CSE", 2, true],
    ["CSE-1203", "Discrete Mathematics", "3.0", "theory", "CSE", 2, false],
    ["CSE-2101", "Data Structures", "3.0", "theory", "CSE", 3, false],
    ["CSE-2102", "Data Structures Sessional", "2.0", "sessional", "CSE", 3, true],
    ["CSE-2103", "Digital Logic Design", "3.0", "theory", "CSE", 3, false],
    ["EEE-2101", "Electrical Circuits", "3.0", "theory", "EEE", 3, false],
    ["CSE-2201", "Algorithms", "3.0", "theory", "CSE", 4, false],
    ["CSE-2202", "Algorithms Sessional", "2.0", "sessional", "CSE", 4, true],
    ["CSE-2203", "Database Management Systems", "3.0", "theory", "CSE", 4, false],
    ["CSE-2204", "Database Management Systems Sessional", "2.0", "sessional", "CSE", 4, true],
    ["CSE-3101", "Operating Systems", "3.0", "theory", "CSE", 5, false],
    ["CSE-3102", "Operating Systems Sessional", "2.0", "sessional", "CSE", 5, true],
    ["CSE-3103", "Computer Networks", "3.0", "theory", "CSE", 5, false],
    ["CSE-3104", "Software Engineering", "3.0", "theory", "CSE", 5, false],
    ["CSE-3201", "Compiler Design", "3.0", "theory", "CSE", 6, false],
    ["CSE-3203", "Artificial Intelligence", "3.0", "theory", "CSE", 6, false],
    ["CSE-3205", "Microprocessors and Interfacing", "3.0", "theory", "CSE", 6, false],
    ["CSE-4101", "Machine Learning", "3.0", "theory", "CSE", 7, false],
    ["CSE-4103", "Computer Security", "3.0", "theory", "CSE", 7, false],
    ["CSE-4000(A)", "Thesis / Project — Part A", "2.0", "thesis", "CSE", 7, false],
    ["CSE-4000(B)", "Thesis / Project — Part B", "4.0", "thesis", "CSE", 8, false],
    ["CSE-4201", "Cloud Computing", "3.0", "theory", "CSE", 8, false],
  ];
  const courseRows = await db
    .insert(courses)
    .values(
      courseSeed.map(([code, title, credits, courseType, owning, semester, needsLab]) => ({
        code, title, credits, courseType, owningDepartmentId: dept[owning], semester, needsLab,
        requiredRoomCapability: courseType === "sessional" ? "computer" : null,
      })),
    )
    .returning();
  const C = Object.fromEntries(courseRows.map((c) => [c.code, c.id]));
  const courseById = new Map(courseRows.map((c) => [c.id, c]));
  const coursesBySemester = new Map<number, typeof courseRows>();
  for (const c of courseRows) {
    const arr = coursesBySemester.get(c.semester) ?? [];
    arr.push(c);
    coursesBySemester.set(c.semester, arr);
  }

  // -------------------------------- offerings ------------------------------
  const offeringValues: { courseId: number; batchId: number; termId: number; status: string }[] = [];
  for (const b of batchRows) {
    const sem = semOf(b.stream, b.label);
    for (const c of coursesBySemester.get(sem) ?? []) {
      offeringValues.push({ courseId: c.id, batchId: b.id, termId: term.id, status: "open" });
    }
  }
  const offeringRows = await db.insert(courseOfferings).values(offeringValues).returning();
  const offeringId = (courseCode: string, stream: string, label: string) =>
    offeringRows.find((o) => o.courseId === C[courseCode] && o.batchId === B[`${stream}|${label}`])!.id;

  // ------------------------------ teaching groups --------------------------
  // Teacher assignment map: course -> primary instructor short code
  const primaryTeacher: Record<string, string> = {
    "CSE-1101": "MRI", "CSE-1102": "MRI", "MATH-1101": "SAK", "PHY-1101": "RZK", "ENG-1101": "TNC",
    "CSE-1201": "FRH", "CSE-1202": "FRH", "CSE-1203": "JNF",
    "CSE-2101": "KMH", "CSE-2102": "KMH", "CSE-2103": "SLM", "EEE-2101": "AHF",
    "CSE-2201": "TAH", "CSE-2202": "TAH", "CSE-2203": "NAK", "CSE-2204": "NAK",
    "CSE-3101": "IMN", "CSE-3102": "IMN", "CSE-3103": "IM", "CSE-3104": "MIM",
    "CSE-3201": "RBK", "CSE-3203": "SLM",
    "CSE-4101": "JNF", "CSE-4103": "IM", "CSE-4201": "MIM",
    "CSE-4000(A)": "NAK", "CSE-4000(B)": "MRI",
  };
  // Diploma 4th semester courses are taught by SJD instead of TAH.
  const dipOverride: Record<string, string> = { "CSE-2201": "SJD", "CSE-2202": "SJD" };

  interface GroupPlan {
    key: string;
    courseCode: string;
    offeringIds: number[];
    deliveryMode: string;
    externalAudienceLabel?: string;
    externalStudentCount?: number | null;
    pendingReconciliation?: boolean;
    notes?: string;
    teacherCodes: { code: string; role: string }[];
    expectedWeeklyMinutes: number | null;
    requiredMeetings: number;
  }
  const groupPlans: GroupPlan[] = [];

  for (const b of batchRows) {
    const sem = semOf(b.stream, b.label);
    for (const c of coursesBySemester.get(sem) ?? []) {
      const stream = b.stream as "HSC" | "DIPLOMA";
      const isDip = stream === "DIPLOMA";
      // Merged cross-stream class: CSE-2101 for HSC-27B + Diploma-21B.
      if ((b.label === "27B" && stream === "HSC") || (b.label === "21B" && stream === "DIPLOMA")) {
        if (c.code === "CSE-2101") continue; // handled below as one merged group
        if (c.code === "EEE-2101" && b.label === "27B") continue; // shared w/ external EEE audience
      }
      if (c.code === "CSE-3205") {
        // Unfilled teaching vacancy — “UT / Upcoming Teacher”. No meetings.
        groupPlans.push({
          key: `${c.code}|${b.stream}-${b.label}`,
          courseCode: c.code,
          offeringIds: [offeringId(c.code, b.stream, b.label)],
          deliveryMode: "fixed",
          notes: "Unfilled teaching requirement (UT — Upcoming Teacher). Not a real login or person.",
          teacherCodes: [],
          expectedWeeklyMinutes: isDip ? 120 : 150,
          requiredMeetings: 2,
        });
        continue;
      }
      if (c.courseType === "thesis") {
        const sup = (c.code === "CSE-4000(A)" && b.stream === "DIPLOMA") ? "JNF"
          : (c.code === "CSE-4000(B)" && b.stream === "DIPLOMA") ? "KMH"
          : primaryTeacher[c.code];
        groupPlans.push({
          key: `${c.code}|${b.stream}-${b.label}`,
          courseCode: c.code,
          offeringIds: [offeringId(c.code, b.stream, b.label)],
          deliveryMode: "teacher_managed",
          notes: "Teacher-managed research work — shown as asterisked annotation, not weekly timetable slots.",
          teacherCodes: [{ code: sup, role: "instructor" }],
          expectedWeeklyMinutes: null,
          requiredMeetings: 0,
        });
        continue;
      }
      const teacher = isDip && dipOverride[c.code] ? dipOverride[c.code] : primaryTeacher[c.code];
      const expected = c.courseType === "sessional" ? (isDip ? 120 : 150) : (isDip ? 120 : 150);
      groupPlans.push({
        key: `${c.code}|${b.stream}-${b.label}`,
        courseCode: c.code,
        offeringIds: [offeringId(c.code, b.stream, b.label)],
        deliveryMode: "fixed",
        teacherCodes: c.code === "CSE-2201" && !isDip
          ? [{ code: "TAH", role: "instructor" }, { code: "SJD", role: "co_teacher" }]
          : [{ code: teacher, role: "instructor" }],
        expectedWeeklyMinutes: expected,
        requiredMeetings: c.courseType === "sessional" ? 1 : 2,
      });
    }
  }

  // One merged group — stored once, displayed in both stream views.
  groupPlans.push({
    key: "CSE-2101|MERGED",
    courseCode: "CSE-2101",
    offeringIds: [offeringId("CSE-2101", "HSC", "27B"), offeringId("CSE-2101", "DIPLOMA", "21B")],
    deliveryMode: "fixed",
    pendingReconciliation: true,
    notes: "Cross-stream merged class. HSC view showed 12:00–13:15 while Diploma table used 12:00–13:00 — timing reconciliation pending (spec §3.3). One canonical meeting must be confirmed before official import.",
    teacherCodes: [{ code: "KMH", role: "instructor" }],
    expectedWeeklyMinutes: 150,
    requiredMeetings: 2,
  });

  // EEE-2101: CSE students join an EEE-department audience ("CSE + EEE").
  groupPlans.push({
    key: "EEE-2101|SHARED",
    courseCode: "EEE-2101",
    offeringIds: [offeringId("EEE-2101", "HSC", "27B")],
    deliveryMode: "fixed",
    externalAudienceLabel: "EEE-22B",
    externalStudentCount: null, // unknown — capacity advisory, not zero
    notes: "Shared departmental class with EEE-22B (external audience size unverified).",
    teacherCodes: [{ code: "AHF", role: "instructor" }],
    expectedWeeklyMinutes: 150,
    requiredMeetings: 2,
  });

  const groupRows = await db
    .insert(teachingGroups)
    .values(
      groupPlans.map((g) => ({
        termId: term.id,
        courseId: C[g.courseCode],
        deliveryMode: g.deliveryMode,
        externalAudienceLabel: g.externalAudienceLabel ?? null,
        externalStudentCount: g.externalStudentCount ?? null,
        pendingReconciliation: g.pendingReconciliation ?? false,
        notes: g.notes ?? null,
      })),
    )
    .returning();
  const G = Object.fromEntries(groupRows.map((g, i) => [groupPlans[i].key, g.id]));

  await db.insert(teachingGroupOfferings).values(
    groupPlans.flatMap((g, i) =>
      g.offeringIds.map((oid) => ({ teachingGroupId: groupRows[i].id, offeringId: oid })),
    ),
  );

  await db.insert(teachingRequirements).values(
    groupPlans.map((g, i) => ({
      teachingGroupId: groupRows[i].id,
      expectedWeeklyMinutes: g.expectedWeeklyMinutes,
      requiredMeetingsPerWeek: g.requiredMeetings,
      status: g.pendingReconciliation ? "provisional" : "approved",
      notes: g.notes ?? null,
    })),
  );

  // ---------------------------- busy-book records --------------------------
  type Interval = [number, number];
  const busyBatch = new Map<number, Map<number, Interval[]>>();
  const busyTeacher = new Map<number, Map<number, Interval[]>>();
  const busyRoom = new Map<number, Map<number, Interval[]>>();
  function occupy(map: Map<number, Map<number, Interval[]>>, id: number, day: number, s: number, e: number) {
    if (!map.has(id)) map.set(id, new Map());
    const d = map.get(id)!;
    if (!d.has(day)) d.set(day, []);
    d.get(day)!.push([s, e]);
  }
  function isFree(map: Map<number, Map<number, Interval[]>>, id: number, day: number, s: number, e: number) {
    const ivs = map.get(id)?.get(day) ?? [];
    return !ivs.some(([a, b]) => s < b && a < e);
  }

  // ----------------------- external (OD) commitments -----------------------
  const ecRows = await db
    .insert(externalCommitments)
    .values([
      {
        termId: term.id, kind: "teaching", completenessLevel: "A",
        counterpartDepartment: "Mathematics", teacherId: T.MRI, roomId: R["MB-201"],
        courseLabel: "MAT-2201 Complex Analysis", audienceLabel: "MATH 2nd year",
        dayOfWeek: 1, startMinutes: 720, endMinutes: 795, credits: "3.0",
        verificationStatus: "verified", source: "Math dept routine (email, verified)",
        lastVerifiedAt: new Date("2026-07-28T06:00:00Z"),
        notes: "Outgoing teaching — blocks MRI and counts toward known workload.",
      },
      {
        termId: term.id, kind: "teaching", completenessLevel: "A",
        counterpartDepartment: "EEE", teacherId: T.NAK, roomId: R["EEE-303"],
        courseLabel: "Programming Fundamentals for EEE", audienceLabel: "EEE-31B",
        dayOfWeek: 0, startMinutes: 540, endMinutes: 630, credits: "3.0",
        verificationStatus: "verified", source: "EEE coordinator confirmation",
        lastVerifiedAt: new Date("2026-07-29T06:00:00Z"),
      },
      {
        termId: term.id, kind: "teaching", completenessLevel: "A",
        counterpartDepartment: "EEE", teacherId: T.NAK, roomId: R["EEE-303"],
        courseLabel: "Programming Fundamentals for EEE", audienceLabel: "EEE-31B",
        dayOfWeek: 1, startMinutes: 540, endMinutes: 630, credits: "3.0",
        verificationStatus: "verified", source: "EEE coordinator confirmation",
        lastVerifiedAt: new Date("2026-07-29T06:00:00Z"),
      },
      {
        termId: term.id, kind: "room_reservation", completenessLevel: "C",
        counterpartDepartment: "Pharmacy", roomId: R["NB-307"],
        dayOfWeek: 6, startMinutes: 540, endMinutes: 600,
        verificationStatus: "verified", source: "Routine screenshot — OD row",
        notes: "Room-only OD booking: blocks NB-307 only. Must not invent a teacher conflict or fabricated credits.",
      },
      {
        termId: term.id, kind: "room_reservation", completenessLevel: "C",
        counterpartDepartment: "EEE", roomId: R["NB-305"],
        dayOfWeek: 0, startMinutes: 720, endMinutes: 780,
        verificationStatus: "verified", source: "Routine screenshot — OD row",
      },
      {
        termId: term.id, kind: "teaching", completenessLevel: "B",
        counterpartDepartment: "Business Administration", teacherId: T.TAH,
        dayOfWeek: 1, startMinutes: 645, endMinutes: 720,
        verificationStatus: "pending", source: "Verbal note from coordinator",
        notes: "Course, credits and room unknown — teacher time blocked, workload unknown (not zero).",
      },
      {
        termId: term.id, kind: "unresolved_note", completenessLevel: "D",
        counterpartDepartment: "EEE",
        verificationStatus: "pending", source: "Routine screenshot — ambiguous cell",
        notes: "“EEE-2101 lab NB-408/505?” — multiple-room label requires review before import. No reservation fabricated.",
      },
    ])
    .returning();

  // Register OD blocks.
  occupy(busyTeacher, T.MRI, 1, 720, 795);
  occupy(busyTeacher, T.NAK, 0, 540, 630);
  occupy(busyTeacher, T.NAK, 1, 540, 630);
  occupy(busyTeacher, T.TAH, 1, 645, 720);
  occupy(busyRoom, R["NB-307"], 6, 540, 600);
  occupy(busyRoom, R["NB-305"], 0, 720, 780);

  // ------------------------- manual (canonical) meetings --------------------
  const insertedMeetingKeys = new Set<string>();
  async function addMeeting(opts: {
    groupKey: string;
    day: number;
    start: number;
    end: number;
    teacherCodes: { code: string; role: string }[];
    roomCode: string;
    isException?: boolean;
    exceptionNote?: string;
    customTimeLabel?: string;
    highlight?: string;
  }) {
    const gid = G[opts.groupKey];
    const [m] = await db.insert(meetings).values({
      teachingGroupId: gid,
      dayOfWeek: opts.day,
      startMinutes: opts.start,
      endMinutes: opts.end,
      isException: opts.isException ?? false,
      exceptionNote: opts.exceptionNote ?? null,
      customTimeLabel: opts.customTimeLabel ?? null,
      highlightColor: opts.highlight ?? null,
    }).returning();
    await db.insert(meetingTeachers).values(
      opts.teacherCodes.map((t) => ({ meetingId: m.id, teacherId: T[t.code], role: t.role })),
    );
    await db.insert(meetingRooms).values({ meetingId: m.id, roomId: R[opts.roomCode] });
    const plan = groupPlans.find((g) => g.key === opts.groupKey)!;
    for (const oid of plan.offeringIds) {
      const off = offeringRows.find((o) => o.id === oid)!;
      occupy(busyBatch, off.batchId, opts.day, opts.start, opts.end);
    }
    for (const t of opts.teacherCodes) occupy(busyTeacher, T[t.code], opts.day, opts.start, opts.end);
    occupy(busyRoom, R[opts.roomCode], opts.day, opts.start, opts.end);
    insertedMeetingKeys.add(opts.groupKey);
    return m.id;
  }

  // Merged cross-stream CSE-2101 — one canonical physical event, Saturday.
  await addMeeting({
    groupKey: "CSE-2101|MERGED", day: 0, start: 645, end: 720,
    teacherCodes: [{ code: "KMH", role: "instructor" }], roomCode: "505",
    customTimeLabel: "10:45 AM – 12:00 PM", highlight: "blue",
  });
  await addMeeting({
    groupKey: "CSE-2101|MERGED", day: 0, start: 720, end: 795,
    teacherCodes: [{ code: "KMH", role: "instructor" }], roomCode: "505",
    customTimeLabel: "12:00 – 1:15 PM*", highlight: "blue",
  });
  // Shared CSE + EEE class.
  await addMeeting({ groupKey: "EEE-2101|SHARED", day: 0, start: 870, end: 945, teacherCodes: [{ code: "AHF", role: "instructor" }], roomCode: "505" });
  await addMeeting({ groupKey: "EEE-2101|SHARED", day: 1, start: 570, end: 645, teacherCodes: [{ code: "AHF", role: "instructor" }], roomCode: "505" });
  // Approved HSC Friday exception (custom timing) — visible, not silently widened to all batches.
  await addMeeting({
    groupKey: "ENG-1101|HSC-29B", day: 6, start: 600, end: 675,
    teacherCodes: [{ code: "TNC", role: "instructor" }], roomCode: "NB-301",
    isException: true,
    exceptionNote: "Approved HSC Friday exception for 29B only — pending confirmation of the HSC Friday policy (spec §3.3).",
    customTimeLabel: "10:00 – 11:15 AM*", highlight: "green",
  });

  // ------------------------------ generator --------------------------------
  const HSC_THEORY_CANDIDATES = [0, 1, 2, 3].flatMap((day) =>
    HSC_SLOTS.map((s) => ({ day, start: s.start, end: s.end })),
  );
  const HSC_SESSIONAL_CANDIDATES = [0, 1, 2, 3].flatMap((day) => [
    { day, start: 570, end: 720 },
    { day, start: 645, end: 795 },
  ]);
  const DIP_THEORY_CANDIDATES = [
    ...DIPLOMA_FRIDAY_SLOTS.map((s) => ({ day: 6, start: s.start, end: s.end })),
    ...DIPLOMA_SATURDAY_SLOTS.map((s) => ({ day: 0, start: s.start, end: s.end })),
  ];
  const DIP_SESSIONAL_CANDIDATES = [
    { day: 6, start: 540, end: 660 }, { day: 6, start: 600, end: 720 },
    { day: 6, start: 660, end: 780 }, { day: 6, start: 840, end: 960 },
    { day: 0, start: 720, end: 840 }, { day: 0, start: 780, end: 900 },
    { day: 0, start: 840, end: 960 },
  ];

  const CSE_ROOMS = roomRows.filter((r) => r.owningDepartmentId === dept.CSE);

  // Count manually-placed meetings per group.
  const placedCount = new Map<string, number>();
  for (const key of insertedMeetingKeys) placedCount.set(key, 1); // ENG exception = 1
  placedCount.set("CSE-2101|MERGED", 2);
  placedCount.set("EEE-2101|SHARED", 2);

  // Deliberate partial scheduling: CSE-4101 HSC-23B gets only 1 of 2 meetings.
  const deliberateUnderScheduled = new Set(["CSE-4101|HSC-23B"]);

  interface PendingMeeting { plan: GroupPlan; batchIds: number[]; teacherIds: number[]; size: number; sessional: boolean; stream: "HSC" | "DIPLOMA"; }
  const pendings: PendingMeeting[] = [];

  for (const plan of groupPlans) {
    if (plan.deliveryMode === "teacher_managed") continue;
    if (plan.teacherCodes.length === 0) continue; // vacancy — nothing to schedule
    const already = placedCount.get(plan.key) ?? 0;
    let need = plan.requiredMeetings - already;
    if (deliberateUnderScheduled.has(plan.key)) need = Math.min(need, 1);
    if (need <= 0) continue;
    const course = courseById.get(C[plan.courseCode])!;
    const batchIds = plan.offeringIds.map((oid) => offeringRows.find((o) => o.id === oid)!.batchId);
    const batchStream = batchRows.find((b) => b.id === batchIds[0])!.stream as "HSC" | "DIPLOMA";
    const size = batchIds.reduce((sum, bid) => sum + (batchRows.find((b) => b.id === bid)!.studentCount ?? 60), 0)
      + (plan.externalAudienceLabel ? (plan.externalStudentCount ?? 60) : 0);
    for (let i = 0; i < need; i++) {
      pendings.push({
        plan,
        batchIds,
        teacherIds: plan.teacherCodes.map((t) => T[t.code]),
        size,
        sessional: course.courseType === "sessional",
        stream: batchStream,
      });
    }
  }

  // Schedule big/multi-teacher/sessional items first for better packing.
  pendings.sort((a, b) =>
    (b.sessional ? 1 : 0) - (a.sessional ? 1 : 0) ||
    b.size - a.size ||
    b.teacherIds.length - a.teacherIds.length,
  );

  const roomUsage = new Map<number, number>();
  const unplaced: PendingMeeting[] = [];

  for (const p of pendings) {
    const candidates = shuffled(
      p.stream === "HSC"
        ? p.sessional ? HSC_SESSIONAL_CANDIDATES : HSC_THEORY_CANDIDATES
        : p.sessional ? DIP_SESSIONAL_CANDIDATES : DIP_THEORY_CANDIDATES,
    );
    let placedOk = false;
    for (const cand of candidates) {
      if (!p.batchIds.every((bid) => isFree(busyBatch, bid, cand.day, cand.start, cand.end))) continue;
      if (!p.teacherIds.every((tid) => isFree(busyTeacher, tid, cand.day, cand.start, cand.end))) continue;

      const fittingRooms = CSE_ROOMS
        .filter((r) => (p.sessional ? r.roomType === "lab" : true))
        .filter((r) => (r.capacity ?? 0) >= p.size)
        .filter((r) => isFree(busyRoom, r.id, cand.day, cand.start, cand.end))
        .sort((a, b) => (roomUsage.get(a.id) ?? 0) - (roomUsage.get(b.id) ?? 0) || (a.capacity ?? 0) - (b.capacity ?? 0));
      const room = fittingRooms[0];
      if (!room) continue;

      const [m] = await db.insert(meetings).values({
        teachingGroupId: G[p.plan.key],
        dayOfWeek: cand.day,
        startMinutes: cand.start,
        endMinutes: cand.end,
      }).returning();
      await db.insert(meetingTeachers).values(
        p.plan.teacherCodes.map((t) => ({ meetingId: m.id, teacherId: T[t.code], role: t.role })),
      );
      await db.insert(meetingRooms).values({ meetingId: m.id, roomId: room.id });
      for (const bid of p.batchIds) occupy(busyBatch, bid, cand.day, cand.start, cand.end);
      for (const tid of p.teacherIds) occupy(busyTeacher, tid, cand.day, cand.start, cand.end);
      occupy(busyRoom, room.id, cand.day, cand.start, cand.end);
      roomUsage.set(room.id, (roomUsage.get(room.id) ?? 0) + 1);
      placedOk = true;
      break;
    }
    if (!placedOk) unplaced.push(p);
  }

  if (unplaced.length > 0) {
    console.error("Unplaced meetings (seed must be clash-free):");
    for (const u of unplaced) console.error(" -", u.plan.key);
    throw new Error(`Seed failed: ${unplaced.length} meetings could not be placed`);
  }

  // --------------------------- workload allocations -------------------------
  const allocationValues: {
    teacherId: number; termId: number; teachingGroupId: number | null;
    externalCommitmentId: number | null; units: string; allocationMethod: string; policyNote: string | null;
  }[] = [];

  for (const plan of groupPlans) {
    const course = courseById.get(C[plan.courseCode])!;
    if (plan.teacherCodes.length === 0) continue; // vacancy
    if (plan.key === "CSE-2101|MERGED") {
      allocationValues.push({
        teacherId: T.KMH, termId: term.id, teachingGroupId: G[plan.key],
        externalCommitmentId: null, units: "3.0", allocationMethod: "shared_policy",
        policyNote: "One merged HSC+Diploma 3-credit delivery — meeting time and credits counted once, not 6 units (spec §16.3).",
      });
      continue;
    }
    if (plan.key === "CSE-2201|HSC-26B") {
      allocationValues.push(
        { teacherId: T.TAH, termId: term.id, teachingGroupId: G[plan.key], externalCommitmentId: null, units: "2.0", allocationMethod: "split", policyNote: "Co-teaching split 2/1 — explicitly not an assumed 50/50." },
        { teacherId: T.SJD, termId: term.id, teachingGroupId: G[plan.key], externalCommitmentId: null, units: "1.0", allocationMethod: "split", policyNote: "Co-teaching split 2/1 — explicitly not an assumed 50/50." },
      );
      continue;
    }
    const units =
      course.courseType === "sessional" ? "1.5"
      : course.courseType === "thesis" ? course.credits
      : "3.0";
    for (const tc of plan.teacherCodes) {
      allocationValues.push({
        teacherId: T[tc.code], termId: term.id, teachingGroupId: G[plan.key],
        externalCommitmentId: null, units, allocationMethod: "sole",
        policyNote: null,
      });
    }
  }
  // External teaching allocations (known units only).
  allocationValues.push(
    { teacherId: T.MRI, termId: term.id, teachingGroupId: null, externalCommitmentId: ecRows[0].id, units: "3.0", allocationMethod: "external", policyNote: "Outgoing teaching — Mathematics dept (verified)." },
    { teacherId: T.NAK, termId: term.id, teachingGroupId: null, externalCommitmentId: ecRows[1].id, units: "3.0", allocationMethod: "external", policyNote: "Outgoing teaching — EEE dept (verified)." },
  );
  await db.insert(workloadAllocations).values(allocationValues);

  // ------------------------------- time policy ------------------------------
  // Break scoping follows the source evidence exactly: the lunch window is
  // evidenced by the HSC slot pattern; the Diploma Friday Jumu'ah break is
  // the corrected 13:00–14:00; Diploma Saturday shows no break in the source.
  await db.insert(breakRules).values([
    { name: "Lunch Break", scope: "stream", stream: "HSC", dayOfWeek: null, startMinutes: 795, endMinutes: 870 },
    { name: "Prayer Break (Jumu'ah)", scope: "stream", stream: "DIPLOMA", dayOfWeek: 6, startMinutes: 780, endMinutes: 840 },
  ]);

  await db.insert(permittedWindows).values([
    ...[0, 1, 2, 3].map((d) => ({ termId: term.id, batchId: null, stream: "HSC", dayOfWeek: d, startMinutes: 570, endMinutes: 945, requiresExceptionNote: null as string | null })),
    { termId: term.id, batchId: null, stream: "DIPLOMA", dayOfWeek: 6, startMinutes: 540, endMinutes: 1020, requiresExceptionNote: null },
    { termId: term.id, batchId: null, stream: "DIPLOMA", dayOfWeek: 0, startMinutes: 540, endMinutes: 1020, requiresExceptionNote: "Saturday 09:00–17:00 per coordinator guidance — morning slot headers pending source review." },
  ]);

  // --------------------------- publication v1 -------------------------------
  const meetingRows = await db.select().from(meetings);
  const groupRowsAll = await db.select().from(teachingGroups);
  const linkRows = await db.select().from(teachingGroupOfferings);
  const mtRows = await db.select().from(meetingTeachers);
  const mrRows = await db.select().from(meetingRooms);
  const placementRows = await db.select().from(batchTermPlacements);

  const views = assembleMeetingViews({
    meetings: meetingRows,
    groups: groupRowsAll,
    courses: courseRows,
    departments: deptRows,
    links: linkRows,
    offerings: offeringRows,
    batches: batchRows,
    placements: placementRows.filter((p) => p.termId === term.id),
    meetingTeachers: mtRows,
    meetingRooms: mrRows,
    teachers: teacherRows,
    rooms: roomRows,
  });

  const snapshot = buildSnapshot(views, TERM.name, TERM.effectiveFrom, 1);
  await db.insert(scheduleVersions).values({
    termId: term.id,
    versionNumber: 1,
    state: "published",
    effectiveFrom: TERM.effectiveFrom,
    effectiveTo: null,
    publishedAt: new Date(),
    publishedBy: "CSE Coordinator",
    changeSummary: "Initial Summer 2026 publication (synthetic development data).",
    snapshot,
  });

  await db.insert(auditEvents).values([
    { actor: "system-seed", action: "seed", entity: "term", entityId: term.id, detail: { note: "Synthetic development seed — no real contact data." } },
    { actor: "CSE Coordinator", action: "publish", entity: "schedule_version", entityId: 1, detail: { version: 1, effectiveFrom: TERM.effectiveFrom } },
  ]);

  console.log(`Seed complete:
  ${deptRows.length} departments, ${teacherRows.length} teachers, ${roomRows.length} rooms
  ${batchRows.length} batches, ${courseRows.length} courses, ${offeringRows.length} offerings
  ${groupRows.length} teaching groups, ${meetingRows.length} meetings
  ${ecRows.length} external commitments, ${allocationValues.length} workload allocations
  Published routine version 1 (effective ${TERM.effectiveFrom})`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/src/db/seed.ts")) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
