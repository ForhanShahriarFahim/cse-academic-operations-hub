/**
 * Serialized views shared between server components, client components,
 * the conflict engine, and immutable publication snapshots. Pure module —
 * no database access here.
 */

import type { BreakRule, Issue } from "./conflicts";
import { isTimeGrid, type TimeGrid } from "./time-grid";

export interface TeacherRef {
  id: number;
  shortCode: string;
  fullName: string;
  homeDepartmentCode: string | null;
  designation: string | null;
  isExternalCse: boolean; // teacher whose home department is not CSE
  role: string;
}

export interface RoomRef {
  id: number;
  code: string;
  building: string;
  roomType: string;
  capabilities: string[];
  capacity: number | null;
}

export interface AudienceRef {
  batchId: number;
  batchLabel: string;
  stream: "HSC" | "DIPLOMA";
  semester: number | null;
  studentCount: number | null;
}

export interface MeetingView {
  id: number;
  teachingGroupId: number;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  courseCode: string;
  courseTitle: string;
  courseType: string;
  courseCredits: number;
  requiredRoomCapability: string | null;
  owningDepartmentCode: string | null;
  deliveryMode: string;
  isException: boolean;
  exceptionNote: string | null;
  customTimeLabel: string | null;
  highlightColor: string | null;
  pendingReconciliation: boolean;
  teachers: TeacherRef[];
  rooms: RoomRef[];
  audiences: AudienceRef[];
  externalAudienceLabel: string | null;
  externalStudentCount: number | null;
}

export interface ExternalCommitmentView {
  id: number;
  kind: string;
  completenessLevel: string;
  counterpartDepartment: string;
  teacherId: number | null;
  teacherShortCode: string | null;
  teacherName: string | null;
  roomId: number | null;
  roomCode: string | null;
  courseLabel: string | null;
  audienceLabel: string | null;
  dayOfWeek: number | null;
  startMinutes: number | null;
  endMinutes: number | null;
  credits: number | null;
  verificationStatus: string;
  source: string | null;
  lastVerifiedAt: string | null;
  notes: string | null;
}

/** Streams spanned by a meeting's local audiences. */
export function meetingStreams(m: MeetingView): ("HSC" | "DIPLOMA")[] {
  const set = new Set<"HSC" | "DIPLOMA">();
  for (const a of m.audiences) set.add(a.stream);
  return [...set];
}

/** Derived sharing label — presentation only, never the membership model. */
export function sharingLabel(m: MeetingView): string | null {
  const streams = meetingStreams(m);
  const parts: string[] = [];
  if (streams.length > 1) parts.push("HSC + DIP");
  if (m.externalAudienceLabel) parts.push("CSE + " + (m.externalAudienceLabel.split("-")[0] ?? "EXT"));
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

/** Total known audience size; null when any part is unknown. */
export function knownAudienceSize(m: MeetingView): number | null {
  let total = 0;
  for (const a of m.audiences) {
    if (a.studentCount == null) return null;
    total += a.studentCount;
  }
  if (m.externalAudienceLabel) {
    if (m.externalStudentCount == null) return null;
    total += m.externalStudentCount;
  }
  return total;
}

export function durationMinutes(m: MeetingView): number {
  return m.endMinutes - m.startMinutes;
}

// ---------------------------------------------------------------------------
// Publication snapshot
// ---------------------------------------------------------------------------

export interface PublicationSnapshotV1 {
  generatedAt: string;
  termName: string;
  effectiveFrom: string | null;
  versionNumber: number;
  meetings: MeetingView[];
}

export interface PublicationBatch {
  id: number;
  stream: "HSC" | "DIPLOMA";
  label: string;
  semester: number | null;
  studentCount: number | null;
  sortOrder: number;
}

export interface PublicationTerm {
  id: number;
  name: string;
  academicYear: number;
  effectiveFrom: string | null;
}

export interface PublicationSnapshotV2 {
  schemaVersion: 2;
  generatedAt: string;
  term: PublicationTerm;
  versionNumber: number;
  meetings: MeetingView[];
  batches: PublicationBatch[];
  breaks: BreakRule[];
  externalCommitments: ExternalCommitmentView[];
  issues: Issue[];
}

export interface PublicationRoutineMetadata {
  teachers: Array<{
    shortCode: string; fullName: string; designation: string | null;
    departmentCode: string | null; phone: string | null; email: string | null; status: string;
  }>;
  courses: Array<{
    code: string; title: string; credits: number; courseType: string; semester: number;
  }>;
  classRepresentatives: Array<{
    stream: "HSC" | "DIPLOMA"; batchLabel: string; fullName: string | null; phone: string | null; sortOrder: number;
  }>;
  queryContacts: Array<{
    fullName: string; designation: string; phone: string; email: string | null; sortOrder: number;
  }>;
  sourceReconciliations: Array<{ detail: string; status: string; sourceLabel: string }>;
}

/**
 * The normalized publication shape. Schema 4 (RUT-04) adds `timeGrid`, the
 * periods and days the version was published with; older versions have none
 * and are drawn with the legacy layout.
 */
export interface PublicationSnapshotV3 extends Omit<PublicationSnapshotV2, "schemaVersion"> {
  schemaVersion: 3 | 4;
  metadata: PublicationRoutineMetadata;
  timeGrid?: TimeGrid;
}

export type PublicationSnapshot = PublicationSnapshotV1 | PublicationSnapshotV2 | PublicationSnapshotV3;

export interface PublicationSnapshotFallback {
  term: PublicationTerm;
  batches: PublicationBatch[];
  breaks: BreakRule[];
  externals: ExternalCommitmentView[];
  issues: Issue[];
  metadata: PublicationRoutineMetadata;
}

export function buildSnapshot(input: {
  meetings: MeetingView[];
  term: PublicationTerm;
  versionNumber: number;
  batches: PublicationBatch[];
  breaks: BreakRule[];
  externals: ExternalCommitmentView[];
  issues: Issue[];
  metadata: PublicationRoutineMetadata;
  timeGrid: TimeGrid;
  generatedAt?: string;
}): PublicationSnapshotV3 {
  return {
    schemaVersion: 4,
    timeGrid: input.timeGrid,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    term: { ...input.term },
    versionNumber: input.versionNumber,
    meetings: input.meetings,
    batches: input.batches,
    breaks: input.breaks,
    externalCommitments: input.externals.filter((item) => item.verificationStatus === "verified"),
    issues: input.issues,
    metadata: input.metadata,
  };
}

function objectValue(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function normalizePublicationSnapshot(
  value: unknown,
  fallback: PublicationSnapshotFallback,
): { snapshot: PublicationSnapshotV3; legacyContext: boolean } | null {
  if (!objectValue(value)) return null;

  if (
    (value.schemaVersion === 3 || (value.schemaVersion === 4 && isTimeGrid(value.timeGrid)))
    && typeof value.generatedAt === "string"
    && typeof value.versionNumber === "number"
    && objectValue(value.term)
    && Array.isArray(value.meetings)
    && Array.isArray(value.batches)
    && Array.isArray(value.breaks)
    && Array.isArray(value.externalCommitments)
    && Array.isArray(value.issues)
    && objectValue(value.metadata)
  ) {
    return { snapshot: value as unknown as PublicationSnapshotV3, legacyContext: false };
  }

  if (
    value.schemaVersion === 2
    && typeof value.generatedAt === "string"
    && typeof value.versionNumber === "number"
    && objectValue(value.term)
    && Array.isArray(value.meetings)
    && Array.isArray(value.batches)
    && Array.isArray(value.breaks)
    && Array.isArray(value.externalCommitments)
    && Array.isArray(value.issues)
  ) {
    return {
      legacyContext: true,
      snapshot: {
        ...(value as unknown as PublicationSnapshotV2),
        schemaVersion: 3,
        metadata: fallback.metadata,
      },
    };
  }

  if (
    typeof value.generatedAt === "string"
    && typeof value.termName === "string"
    && (typeof value.effectiveFrom === "string" || value.effectiveFrom === null)
    && typeof value.versionNumber === "number"
    && Array.isArray(value.meetings)
  ) {
    return {
      legacyContext: true,
      snapshot: {
        schemaVersion: 3,
        generatedAt: value.generatedAt,
        term: {
          ...fallback.term,
          name: value.termName,
          effectiveFrom: value.effectiveFrom,
        },
        versionNumber: value.versionNumber,
        meetings: value.meetings as MeetingView[],
        batches: fallback.batches,
        breaks: fallback.breaks,
        externalCommitments: fallback.externals.filter((item) => item.verificationStatus === "verified"),
        issues: fallback.issues,
        metadata: fallback.metadata,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Assembly from raw relational rows (used by server queries and the seed)
// ---------------------------------------------------------------------------

export interface AssembleInput {
  meetings: Array<{
    id: number;
    teachingGroupId: number;
    dayOfWeek: number;
    startMinutes: number;
    endMinutes: number;
    isException: boolean;
    exceptionNote: string | null;
    customTimeLabel: string | null;
    highlightColor: string | null;
    status: string;
  }>;
  groups: Array<{
    id: number;
    courseId: number;
    deliveryMode: string;
    externalAudienceLabel: string | null;
    externalStudentCount: number | null;
    pendingReconciliation: boolean;
  }>;
  courses: Array<{
    id: number;
    code: string;
    title: string;
    credits: string | number;
    courseType: string;
    requiredRoomCapability: string | null;
    owningDepartmentId: number | null;
  }>;
  departments: Array<{ id: number; code: string }>;
  links: Array<{ teachingGroupId: number; offeringId: number }>;
  offerings: Array<{ id: number; batchId: number }>;
  batches: Array<{
    id: number;
    label: string;
    stream: string;
    studentCount: number | null;
  }>;
  placements: Array<{ batchId: number; semester: number }>;
  meetingTeachers: Array<{ meetingId: number; teacherId: number; role: string }>;
  meetingRooms: Array<{ meetingId: number; roomId: number }>;
  teachers: Array<{
    id: number;
    shortCode: string;
    fullName: string;
    designation: string | null;
    homeDepartmentId: number | null;
  }>;
  rooms: Array<{
    id: number;
    code: string;
    building: string;
    roomType: string;
    capabilities: unknown;
    capacity: number | null;
  }>;
}

export function assembleMeetingViews(input: AssembleInput): MeetingView[] {
  const courseById = new Map(input.courses.map((c) => [c.id, c]));
  const deptCodeById = new Map(input.departments.map((d) => [d.id, d.code]));
  const groupById = new Map(input.groups.map((g) => [g.id, g]));
  const offeringById = new Map(input.offerings.map((o) => [o.id, o]));
  const batchById = new Map(input.batches.map((b) => [b.id, b]));
  const semesterByBatch = new Map(input.placements.map((p) => [p.batchId, p.semester]));
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]));
  const roomById = new Map(input.rooms.map((r) => [r.id, r]));

  const linksByGroup = new Map<number, number[]>();
  for (const l of input.links) {
    const arr = linksByGroup.get(l.teachingGroupId) ?? [];
    arr.push(l.offeringId);
    linksByGroup.set(l.teachingGroupId, arr);
  }
  const mtsByMeeting = new Map<number, typeof input.meetingTeachers>();
  for (const mt of input.meetingTeachers) {
    const arr = mtsByMeeting.get(mt.meetingId) ?? [];
    arr.push(mt);
    mtsByMeeting.set(mt.meetingId, arr);
  }
  const mrsByMeeting = new Map<number, typeof input.meetingRooms>();
  for (const mr of input.meetingRooms) {
    const arr = mrsByMeeting.get(mr.meetingId) ?? [];
    arr.push(mr);
    mrsByMeeting.set(mr.meetingId, arr);
  }

  const out: MeetingView[] = [];
  for (const m of input.meetings) {
    if (m.status !== "active") continue;
    const g = groupById.get(m.teachingGroupId);
    if (!g) continue;
    const course = courseById.get(g.courseId);
    if (!course) continue;

    const audiences: AudienceRef[] = [];
    for (const offId of linksByGroup.get(g.id) ?? []) {
      const off = offeringById.get(offId);
      if (!off) continue;
      const b = batchById.get(off.batchId);
      if (!b) continue;
      audiences.push({
        batchId: b.id,
        batchLabel: b.label,
        stream: b.stream as "HSC" | "DIPLOMA",
        semester: semesterByBatch.get(b.id) ?? null,
        studentCount: b.studentCount,
      });
    }

    const teacherRefs: TeacherRef[] = [];
    for (const mt of mtsByMeeting.get(m.id) ?? []) {
      const t = teacherById.get(mt.teacherId);
      if (!t) continue;
      const home = t.homeDepartmentId ? deptCodeById.get(t.homeDepartmentId) ?? null : null;
      teacherRefs.push({
        id: t.id,
        shortCode: t.shortCode,
        fullName: t.fullName,
        homeDepartmentCode: home,
        designation: t.designation,
        isExternalCse: home !== null && home !== "CSE",
        role: mt.role,
      });
    }

    const roomRefs: RoomRef[] = [];
    for (const mr of mrsByMeeting.get(m.id) ?? []) {
      const r = roomById.get(mr.roomId);
      if (!r) continue;
      roomRefs.push({
        id: r.id,
        code: r.code,
        building: r.building,
        roomType: r.roomType,
        capabilities: Array.isArray(r.capabilities) ? r.capabilities.filter((value): value is string => typeof value === "string") : [],
        capacity: r.capacity,
      });
    }

    out.push({
      id: m.id,
      teachingGroupId: m.teachingGroupId,
      dayOfWeek: m.dayOfWeek,
      startMinutes: m.startMinutes,
      endMinutes: m.endMinutes,
      courseCode: course.code,
      courseTitle: course.title,
      courseType: course.courseType,
      courseCredits: Number(course.credits),
      requiredRoomCapability: course.requiredRoomCapability,
      owningDepartmentCode: course.owningDepartmentId
        ? deptCodeById.get(course.owningDepartmentId) ?? null
        : null,
      deliveryMode: g.deliveryMode,
      isException: m.isException,
      exceptionNote: m.exceptionNote,
      customTimeLabel: m.customTimeLabel,
      highlightColor: m.highlightColor,
      pendingReconciliation: g.pendingReconciliation,
      teachers: teacherRefs,
      rooms: roomRefs,
      audiences,
      externalAudienceLabel: g.externalAudienceLabel,
      externalStudentCount: g.externalStudentCount ?? null,
    });
  }
  return out;
}
