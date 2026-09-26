/**
 * Server-side data access. All queries are plain Drizzle selects assembled
 * into serialized views — safe to hand to client components.
 */
import { db } from "@/db";
import {
  academicTerms,
  batches,
  batchTermPlacements,
  courses,
  departments,
  teachers,
  rooms,
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
  classRepresentatives,
  departmentContacts,
  routineSourceReconciliations,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { can, getOptionalActor } from "./auth";
import { publicMetadata } from "./public-routine";
import {
  assembleMeetingViews,
  type MeetingView,
  type ExternalCommitmentView,
  normalizePublicationSnapshot,
  type PublicationSnapshotV3,
  type PublicationRoutineMetadata,
} from "./serialize";

export interface BatchView {
  id: number;
  stream: "HSC" | "DIPLOMA";
  label: string;
  intake: string | null;
  studentCount: number | null;
  semester: number | null;
  sortOrder: number;
}

export interface TeacherRow {
  id: number;
  shortCode: string;
  fullName: string;
  designation: string | null;
  employmentType: string;
  homeDepartmentId: number | null;
  homeDepartmentCode: string | null;
  homeDepartmentName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
}

export interface RoomRow {
  id: number;
  code: string;
  building: string;
  roomType: string;
  capabilities: string[];
  capacity: number | null;
  owningDepartmentCode: string | null;
  isActive: boolean;
  notes: string | null;
}

export interface CourseRow {
  id: number;
  code: string;
  title: string;
  credits: number;
  courseType: string;
  semester: number;
  owningDepartmentCode: string | null;
  needsLab: boolean;
  requiredRoomCapability: string | null;
}

export interface GroupCoverage {
  teachingGroupId: number;
  courseCode: string;
  courseTitle: string;
  courseType: string;
  deliveryMode: string;
  audience: string;
  teacherCodes: string[];
  hasTeacherAssignment: boolean;
  expectedWeeklyMinutes: number | null;
  requiredMeetings: number;
  scheduledMeetings: number;
  scheduledMinutes: number;
  status:
    | "teacher_managed"
    | "vacancy"
    | "unscheduled"
    | "partial"
    | "scheduled"
    | "over_scheduled";
  pendingReconciliation: boolean;
  notes: string | null;
}

export interface AllocationView {
  id: number;
  teacherId: number;
  units: number;
  allocationMethod: string;
  policyNote: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  teachingGroupId: number | null;
  externalDepartment: string | null;
  externalCommitmentId: number | null;
}

export interface VersionView {
  id: number;
  versionNumber: number;
  state: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  changeSummary: string | null;
  meetingCount: number;
}

export interface PortalData {
  term: {
    id: number;
    name: string;
    academicYear: number;
    startDate: string;
    endDate: string;
    effectiveFrom: string | null;
    status: string;
  };
  departments: { id: number; code: string; name: string }[];
  teachers: TeacherRow[];
  rooms: RoomRow[];
  courses: CourseRow[];
  batches: BatchView[];
  meetings: MeetingView[];
  externals: ExternalCommitmentView[];
  breaks: {
    id: number; name: string; scope: string; stream: string | null;
    dayOfWeek: number | null; startMinutes: number; endMinutes: number;
  }[];
  windows: {
    id: number; termId: number | null; batchId: number | null; stream: string; dayOfWeek: number;
    startMinutes: number; endMinutes: number; note: string | null;
  }[];
  allocations: AllocationView[];
  coverage: GroupCoverage[];
  versions: VersionView[];
  publishedSnapshot: PublicationSnapshotV3 | null;
  publishedSnapshotLegacy: boolean;
  publicationMetadata: PublicationRoutineMetadata;
  classRepresentatives: {
    id: number; batchId: number; stream: "HSC" | "DIPLOMA"; batchLabel: string;
    fullName: string | null; phone: string | null; sortOrder: number;
  }[];
  queryContacts: {
    id: number; fullName: string; designation: string; phone: string; email: string | null; sortOrder: number;
  }[];
  sourceReconciliations: { id: number; detail: string; status: string; sourceLabel: string }[];
}

function toNum(v: string | number | null): number | null {
  if (v == null) return null;
  return Number(v);
}

export async function getActiveTerm() {
  const rows = await db.select().from(academicTerms).where(eq(academicTerms.status, "active")).limit(1);
  if (rows.length === 0) throw new Error("No active academic term — run the seed.");
  return rows[0];
}

export async function getPortalData(): Promise<PortalData> {
  const actor = await getOptionalActor();
  if (!actor) redirect("/login");
  if (!await can(actor, "view_internal_portal")) redirect("/forbidden");
  const privateContacts = await can(actor, "view_private_contacts");
  return loadPortalData(privateContacts);
}

// This entry point exists only for the trusted first-run/seed CLI. It is not
// used by pages, route handlers, or Server Actions.
export async function getPortalDataForSeed(): Promise<PortalData> {
  if (!/(?:^|[\\/])(?:prepare|seed)\.ts$/i.test(process.argv[1] ?? "")) {
    throw new Error("Seed-only data access is unavailable outside the database CLI.");
  }
  return loadPortalData(true);
}

async function loadPortalData(privateContacts: boolean): Promise<PortalData> {
  const term = await getActiveTerm();

  const [
    deptRows, teacherRows, roomRows, courseRows, batchRows, placementRows,
    offeringRows, groupRows, linkRows, requirementRows, meetingRows, mtRows,
    mrRows, breakRows, windowRows, ecRows, allocationRows, versionRows,
    representativeRows, contactRows, reconciliationRows,
  ] = await Promise.all([
    db.select().from(departments),
    db.select().from(teachers),
    db.select().from(rooms),
    db.select().from(courses),
    db.select().from(batches),
    db.select().from(batchTermPlacements).where(eq(batchTermPlacements.termId, term.id)),
    db.select().from(courseOfferings).where(eq(courseOfferings.termId, term.id)),
    db.select().from(teachingGroups).where(eq(teachingGroups.termId, term.id)),
    db.select().from(teachingGroupOfferings),
    db.select().from(teachingRequirements),
    db.select().from(meetings),
    db.select().from(meetingTeachers),
    db.select().from(meetingRooms),
    db.select().from(breakRules),
    db.select().from(permittedWindows),
    db.select().from(externalCommitments).where(eq(externalCommitments.termId, term.id)),
    db.select().from(workloadAllocations).where(eq(workloadAllocations.termId, term.id)),
    db.select().from(scheduleVersions).where(eq(scheduleVersions.termId, term.id))
      .orderBy(desc(scheduleVersions.versionNumber)),
    db.select().from(classRepresentatives).where(eq(classRepresentatives.termId, term.id)),
    db.select().from(departmentContacts).where(eq(departmentContacts.termId, term.id)),
    db.select().from(routineSourceReconciliations).where(eq(routineSourceReconciliations.termId, term.id)),
  ]);

  const deptById = new Map(deptRows.map((d) => [d.id, d]));
  const semesterByBatch = new Map(placementRows.map((p) => [p.batchId, p.semester]));

  const meetingViews = assembleMeetingViews({
    meetings: meetingRows,
    groups: groupRows,
    courses: courseRows,
    departments: deptRows,
    links: linkRows,
    offerings: offeringRows,
    batches: batchRows,
    placements: placementRows,
    meetingTeachers: mtRows,
    meetingRooms: mrRows,
    teachers: teacherRows,
    rooms: roomRows,
  });

  const externals: ExternalCommitmentView[] = ecRows.map((e) => {
    const t = e.teacherId ? teacherRows.find((x) => x.id === e.teacherId) : null;
    const r = e.roomId ? roomRows.find((x) => x.id === e.roomId) : null;
    return {
      id: e.id,
      kind: e.kind,
      completenessLevel: e.completenessLevel,
      counterpartDepartment: e.counterpartDepartment,
      teacherId: e.teacherId,
      teacherShortCode: t?.shortCode ?? null,
      teacherName: t?.fullName ?? null,
      roomId: e.roomId,
      roomCode: r?.code ?? null,
      courseLabel: e.courseLabel,
      audienceLabel: e.audienceLabel,
      dayOfWeek: e.dayOfWeek,
      startMinutes: e.startMinutes,
      endMinutes: e.endMinutes,
      credits: toNum(e.credits),
      verificationStatus: e.verificationStatus,
      source: e.source,
      lastVerifiedAt: e.lastVerifiedAt ? e.lastVerifiedAt.toISOString() : null,
      notes: e.notes,
    };
  });

  // Coverage tracking against teaching requirements (spec §10.4).
  const scheduledByGroup = new Map<number, { minutes: number; count: number }>();
  for (const m of meetingViews) {
    const cur = scheduledByGroup.get(m.teachingGroupId) ?? { minutes: 0, count: 0 };
    cur.minutes += m.endMinutes - m.startMinutes;
    cur.count += 1;
    scheduledByGroup.set(m.teachingGroupId, cur);
  }
  const offeringById = new Map(offeringRows.map((o) => [o.id, o]));
  const batchById = new Map(batchRows.map((b) => [b.id, b]));
  const courseById = new Map(courseRows.map((c) => [c.id, c]));
  const linksByGroup = new Map<number, number[]>();
  for (const l of linkRows) {
    const arr = linksByGroup.get(l.teachingGroupId) ?? [];
    arr.push(l.offeringId);
    linksByGroup.set(l.teachingGroupId, arr);
  }
  // Teacher assignment = any meeting teacher OR any workload allocation.
  const teachersByGroup = new Map<number, Set<string>>();
  for (const m of meetingViews) {
    const set = teachersByGroup.get(m.teachingGroupId) ?? new Set<string>();
    for (const t of m.teachers) set.add(t.shortCode);
    teachersByGroup.set(m.teachingGroupId, set);
  }
  const groupCourse = new Map(groupRows.map((g) => [g.id, g.courseId]));

  const coverage: GroupCoverage[] = groupRows.map((g) => {
    const sched = scheduledByGroup.get(g.id) ?? { minutes: 0, count: 0 };
    const req = requirementRows.find((r) => r.teachingGroupId === g.id);
    const audienceLabels = (linksByGroup.get(g.id) ?? [])
      .map((oid) => offeringById.get(oid))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => batchById.get(o.batchId))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .map((b) => `${b.stream === "HSC" ? "HSC" : "DIP"}-${b.label}`);
    if (g.externalAudienceLabel) audienceLabels.push(g.externalAudienceLabel);
    const course = courseById.get(g.courseId);
    const hasTeacher = (teachersByGroup.get(g.id)?.size ?? 0) > 0
      || allocationRows.some((a) => a.teachingGroupId === g.id);

    let status: GroupCoverage["status"];
    if (g.deliveryMode === "teacher_managed") status = "teacher_managed";
    else if (!hasTeacher) status = "vacancy";
    else if (sched.count === 0) status = "unscheduled";
    else if (req?.expectedWeeklyMinutes && sched.minutes > req.expectedWeeklyMinutes) status = "over_scheduled";
    else if (req?.expectedWeeklyMinutes && sched.minutes < req.expectedWeeklyMinutes) status = "partial";
    else status = "scheduled";

    return {
      teachingGroupId: g.id,
      courseCode: course?.code ?? "?",
      courseTitle: course?.title ?? "?",
      courseType: course?.courseType ?? "theory",
      deliveryMode: g.deliveryMode,
      audience: audienceLabels.join(" + "),
      teacherCodes: [...(teachersByGroup.get(g.id) ?? [])],
      hasTeacherAssignment: hasTeacher,
      expectedWeeklyMinutes: req?.expectedWeeklyMinutes ?? null,
      requiredMeetings: req?.requiredMeetingsPerWeek ?? 0,
      scheduledMeetings: sched.count,
      scheduledMinutes: sched.minutes,
      status,
      pendingReconciliation: g.pendingReconciliation,
      notes: g.notes,
    };
  });

  const allocations: AllocationView[] = allocationRows.map((a) => {
    const course = a.teachingGroupId ? courseById.get(groupCourse.get(a.teachingGroupId) ?? -1) : null;
    const ec = a.externalCommitmentId ? ecRows.find((e) => e.id === a.externalCommitmentId) : null;
    return {
      id: a.id,
      teacherId: a.teacherId,
      units: Number(a.units),
      allocationMethod: a.allocationMethod,
      policyNote: a.policyNote,
      courseCode: course?.code ?? null,
      courseTitle: course?.title ?? null,
      teachingGroupId: a.teachingGroupId,
      externalDepartment: ec?.counterpartDepartment ?? null,
      externalCommitmentId: a.externalCommitmentId,
    };
  });

  const published = versionRows.find((v) => v.state === "published");
  const batchViews: BatchView[] = batchRows
    .map((b) => ({
      id: b.id,
      stream: b.stream as "HSC" | "DIPLOMA",
      label: b.label,
      intake: b.intake,
      studentCount: b.studentCount,
      semester: semesterByBatch.get(b.id) ?? null,
      sortOrder: b.sortOrder,
    }))
    .sort((a, b) => b.sortOrder - a.sortOrder);
  const breakViews = breakRows.map((b) => ({
    id: b.id,
    name: b.name,
    scope: b.scope,
    stream: b.stream,
    dayOfWeek: b.dayOfWeek,
    startMinutes: b.startMinutes,
    endMinutes: b.endMinutes,
  }));
  const publicationMetadata: PublicationRoutineMetadata = {
    teachers: teacherRows.map((teacher) => ({
      shortCode: teacher.shortCode,
      fullName: teacher.fullName,
      designation: teacher.designation,
      departmentCode: teacher.homeDepartmentId ? deptById.get(teacher.homeDepartmentId)?.code ?? null : null,
      phone: teacher.phonePrivate,
      email: teacher.email,
      status: teacher.status,
    })),
    courses: courseRows.map((course) => ({
      code: course.code,
      title: course.title,
      credits: Number(course.credits),
      courseType: course.courseType,
      semester: course.semester,
    })),
    classRepresentatives: representativeRows.map((representative) => {
      const batch = batchById.get(representative.batchId);
      return {
        stream: (batch?.stream ?? "HSC") as "HSC" | "DIPLOMA",
        batchLabel: batch?.label ?? "?",
        fullName: representative.fullName,
        phone: representative.phone,
        sortOrder: representative.sortOrder,
      };
    }),
    queryContacts: contactRows.map((contact) => ({
      fullName: contact.fullName,
      designation: contact.designation,
      phone: contact.phone,
      email: contact.email,
      sortOrder: contact.sortOrder,
    })),
    sourceReconciliations: reconciliationRows.map((item) => ({
      detail: item.detail,
      status: item.status,
      sourceLabel: item.sourceLabel,
    })),
  };
  const normalizedPublished = published?.snapshot
    ? normalizePublicationSnapshot(published.snapshot, {
        term: {
          id: term.id,
          name: term.name,
          academicYear: term.academicYear,
          effectiveFrom: term.effectiveFrom,
        },
        batches: batchViews,
        breaks: breakViews,
        externals,
        issues: [],
        metadata: publicationMetadata,
      })
    : null;

  return {
    term: {
      id: term.id,
      name: term.name,
      academicYear: term.academicYear,
      startDate: term.startDate,
      endDate: term.endDate,
      effectiveFrom: term.effectiveFrom,
      status: term.status,
    },
    departments: deptRows.map((d) => ({ id: d.id, code: d.code, name: d.name })),
    teachers: teacherRows.map((t) => ({
      id: t.id,
      shortCode: t.shortCode,
      fullName: t.fullName,
      designation: t.designation,
      employmentType: t.employmentType,
      homeDepartmentId: t.homeDepartmentId,
      homeDepartmentCode: t.homeDepartmentId ? deptById.get(t.homeDepartmentId)?.code ?? null : null,
      homeDepartmentName: t.homeDepartmentId ? deptById.get(t.homeDepartmentId)?.name ?? null : null,
      email: privateContacts ? t.email : null,
      phone: privateContacts ? t.phonePrivate : null,
      status: t.status,
      notes: t.notes,
    })),
    rooms: roomRows.map((r) => ({
      id: r.id,
      code: r.code,
      building: r.building,
      roomType: r.roomType,
      capabilities: Array.isArray(r.capabilities) ? r.capabilities.filter((value): value is string => typeof value === "string") : [],
      capacity: r.capacity,
      owningDepartmentCode: r.owningDepartmentId ? deptById.get(r.owningDepartmentId)?.code ?? null : null,
      isActive: r.isActive,
      notes: r.notes,
    })),
    courses: courseRows.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      credits: Number(c.credits),
      courseType: c.courseType,
      semester: c.semester,
      owningDepartmentCode: c.owningDepartmentId ? deptById.get(c.owningDepartmentId)?.code ?? null : null,
      needsLab: c.needsLab,
      requiredRoomCapability: c.requiredRoomCapability,
    })),
    batches: batchViews,
    meetings: meetingViews,
    externals,
    breaks: breakViews,
    windows: windowRows.filter((w) => w.termId == null || w.termId === term.id).map((w) => ({
      id: w.id, termId: w.termId, batchId: w.batchId, stream: w.stream, dayOfWeek: w.dayOfWeek,
      startMinutes: w.startMinutes, endMinutes: w.endMinutes,
      note: w.requiresExceptionNote,
    })),
    allocations,
    coverage: coverage.sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.audience.localeCompare(b.audience)),
    versions: versionRows.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      state: v.state,
      effectiveFrom: v.effectiveFrom,
      effectiveTo: v.effectiveTo,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
      publishedBy: v.publishedBy,
      changeSummary: v.changeSummary,
      meetingCount: v.snapshot && typeof v.snapshot === "object"
        ? ((v.snapshot as { meetings?: unknown[] }).meetings?.length ?? 0)
        : 0,
    })),
    publishedSnapshot: normalizedPublished?.snapshot
      ? { ...normalizedPublished.snapshot, metadata: privateContacts
        ? normalizedPublished.snapshot.metadata : publicMetadata(normalizedPublished.snapshot.metadata) }
      : null,
    publishedSnapshotLegacy: normalizedPublished?.legacyContext ?? false,
    publicationMetadata: privateContacts ? publicationMetadata : publicMetadata(publicationMetadata),
    classRepresentatives: representativeRows.map((representative) => {
      const batch = batchById.get(representative.batchId);
      return {
        id: representative.id,
        batchId: representative.batchId,
        stream: (batch?.stream ?? "HSC") as "HSC" | "DIPLOMA",
        batchLabel: batch?.label ?? "?",
        fullName: representative.fullName,
        phone: privateContacts ? representative.phone : null,
        sortOrder: representative.sortOrder,
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder),
    queryContacts: contactRows.map((contact) => ({
      id: contact.id,
      fullName: contact.fullName,
      designation: contact.designation,
      phone: privateContacts ? contact.phone : "",
      email: privateContacts ? contact.email : null,
      sortOrder: contact.sortOrder,
    })).sort((a, b) => a.sortOrder - b.sortOrder),
    sourceReconciliations: reconciliationRows.map((item) => ({
      id: item.id,
      detail: item.detail,
      status: item.status,
      sourceLabel: item.sourceLabel,
    })),
  };
}
