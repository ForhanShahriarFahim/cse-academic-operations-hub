import { and, eq, inArray, ne } from "drizzle-orm";
import { db, databaseReadBatch } from "@/db";
import { attendanceSessions, courseOfferings, meetingTeachers, meetings, teachingGroupOfferings, teachingGroups, workloadAllocations } from "@/db/schema";
import { hasCapability, ROLE_CAPABILITIES, type Actor } from "./auth/policy";
import { type PortalData } from "./data";
import { cohortName, offeringOffered } from "./offering-records";
import { todayIndex } from "./teacher-routine-data";
import { dhakaToday } from "./room-lifecycle";
import type { AttendanceGroup, BrowseBatch } from "./attendance-selection";

export function attendanceEntry(actor: Actor, now: Date) {
  const current = actor.assignments.filter(assignment => assignment.activeFrom <= now
    && (!assignment.activeTo || now < assignment.activeTo));
  const capabilities = new Set<string>(current.flatMap(({ role }) => [...ROLE_CAPABILITIES[role]]));
  return {
    teacher: actor.teacherId != null && capabilities.has("take_attendance"),
    administrator: capabilities.has("manage_rosters"),
  };
}

export async function attendanceDirectory(data: PortalData, actor: Actor, now: Date) {
  const termId = data.term.id;
  const teacherId = actor.teacherId;
  const [groupRows, offerings, links, scheduled, allocated] = await databaseReadBatch([
    () => db.select().from(teachingGroups).where(eq(teachingGroups.termId, termId)).orderBy(teachingGroups.id),
    () => db.select().from(courseOfferings).where(eq(courseOfferings.termId, termId)),
    () => db.select({ groupId: teachingGroupOfferings.teachingGroupId, offeringId: teachingGroupOfferings.offeringId })
      .from(teachingGroupOfferings).innerJoin(teachingGroups, eq(teachingGroups.id, teachingGroupOfferings.teachingGroupId))
      .where(eq(teachingGroups.termId, termId)).orderBy(teachingGroupOfferings.id),
    () => teacherId == null ? Promise.resolve([]) : db.select({ groupId: meetings.teachingGroupId }).from(meetingTeachers)
      .innerJoin(meetings, eq(meetings.id, meetingTeachers.meetingId))
      .innerJoin(teachingGroups, eq(teachingGroups.id, meetings.teachingGroupId))
      .where(and(eq(teachingGroups.termId, termId), eq(meetingTeachers.teacherId, teacherId))),
    () => teacherId == null ? Promise.resolve([]) : db.select({ groupId: workloadAllocations.teachingGroupId }).from(workloadAllocations)
      .innerJoin(teachingGroups, eq(teachingGroups.id, workloadAllocations.teachingGroupId))
      .where(and(eq(teachingGroups.termId, termId), eq(workloadAllocations.teacherId, teacherId))),
  ]);
  const assignedIds = new Set([...scheduled, ...allocated].map(row => row.groupId));
  const courses = new Map(data.courses.map(course => [course.id, course]));
  const batchesById = new Map(data.batches.map(batch => [batch.id, batch]));
  const placements = new Map(data.batches.filter(batch => batch.semester != null).map(batch => [batch.id, batch]));
  const offeringsById = new Map(offerings.map(offering => [offering.id, offering]));
  const offeringsByGroup = new Map<number, number[]>();
  for (const link of links) {
    const offeringIds = offeringsByGroup.get(link.groupId) ?? [];
    offeringIds.push(link.offeringId);
    offeringsByGroup.set(link.groupId, offeringIds);
  }
  const cse = data.departments.find(department => department.code === "CSE");
  const owners = new Map(data.departments.map(department => [department.code, department]));
  const ownerFor = (code: string | null) => code ? owners.get(code) : cse;
  const authorizedDepartments = new Map<string, string>();
  const batchChoices = new Map<string, BrowseBatch>();
  const externalKeys = new Map<string, string>();
  const groups: AttendanceGroup[] = [];

  function saveBatch(department: string, stream: string, value: string, label: string, offered: boolean) {
    const key = `${department}/${stream}/${value}`;
    batchChoices.set(key, { department, stream, value, label, offered: offered || !!batchChoices.get(key)?.offered });
  }

  function savePlacement(department: string, batch: NonNullable<ReturnType<typeof placements.get>>, offered: boolean) {
    saveBatch(department, batch.stream.toLowerCase(), String(batch.id), `${cohortName(batch)} · Semester ${batch.semester}`, offered);
  }

  for (const department of data.departments) {
    if (hasCapability(actor, "manage_rosters", department.id, now)) {
      authorizedDepartments.set(String(department.id), department.code);
    }
  }
  if (cse && authorizedDepartments.has(String(cse.id))) {
    for (const batch of placements.values()) {
      if (batch.status === "active") savePlacement(String(cse.id), batch, false);
    }
  }
  for (const offering of offerings) {
    const course = courses.get(offering.courseId);
    const owner = course && ownerFor(course.owningDepartmentCode);
    const batch = placements.get(offering.batchId);
    if (owner && batch && authorizedDepartments.has(String(owner.id)) && offeringOffered(offering.status)) {
      savePlacement(String(owner.id), batch, true);
    }
  }
  for (const group of groupRows) {
    const course = courses.get(group.courseId);
    if (!course) continue;
    const owner = ownerFor(course.owningDepartmentCode);
    const departmentId = owner?.id ?? null;
    const department = owner ? String(owner.id) : "unassigned";
    const assigned = assignedIds.has(group.id) && hasCapability(actor, "take_attendance", departmentId, now);
    if (!assigned && !hasCapability(actor, "manage_rosters", departmentId, now)) continue;
    authorizedDepartments.set(department, owner?.code ?? "Unassigned department");
    const audiences = new Set<string>();
    const batches = new Set<string>();
    for (const id of offeringsByGroup.get(group.id) ?? []) {
      const offering = offeringsById.get(id);
      if (!offering || offering.courseId !== group.courseId) continue;
      const batch = batchesById.get(offering.batchId);
      if (batch) audiences.add(cohortName(batch));
      const placement = placements.get(offering.batchId);
      if (!placement || !offeringOffered(offering.status)) continue;
      batches.add(String(placement.id));
      savePlacement(department, placement, true);
    }
    const external = group.externalAudienceLabel?.trim();
    if (external) audiences.add(external);
    if (external || batches.size === 0) {
      const label = external || "No batch linked";
      const key = JSON.stringify([department, external]);
      const value = external ? externalKeys.get(key) ?? `external-${group.id}` : "unlinked";
      externalKeys.set(key, value);
      batches.add(value);
      saveBatch(department, "other", value, label, true);
    }
    groups.push({ id: group.id, courseCode: course.code, courseTitle: course.title,
      audience: [...audiences].join(" + ") || "No batch linked", department, assigned, batches: [...batches] });
  }
  return {
    groups: groups.sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.audience.localeCompare(b.audience) || a.id - b.id),
    departments: [...authorizedDepartments].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    batches: [...batchChoices.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export function attendanceToday(data: PortalData, teacherId: number | null, groups: AttendanceGroup[], now: Date) {
  const date = dhakaToday(now);
  const publication = data.versions.find(version => version.state === "published");
  const snapshot = data.publishedSnapshot;
  const from = publication?.effectiveFrom ?? snapshot?.term.effectiveFrom;
  const published = snapshot?.term.id === data.term.id && (!from || from <= date)
    && (!publication?.effectiveTo || date <= publication.effectiveTo);
  const weekday = todayIndex(now);
  const eligible = new Set(groups.filter(group => group.assigned).map(group => group.id));
  const slots = (published ? snapshot.meetings : data.meetings).filter(meeting => {
    if (date < data.term.startDate || date > data.term.endDate || !meeting || !eligible.has(meeting.teachingGroupId)
      || meeting.dayOfWeek !== weekday || !Array.isArray(meeting.rooms) || !Array.isArray(meeting.teachers)
      || !meeting.teachers.some(teacher => teacher?.id === teacherId)) return false;
    const bounds = published ? undefined : data.maintenance?.meetingDates[meeting.id];
    const effectiveFrom = bounds?.effectiveFrom ?? (published ? undefined : data.term.effectiveFrom);
    return (!effectiveFrom || effectiveFrom <= date) && (!bounds?.effectiveTo || date <= bounds.effectiveTo);
  }).sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes || a.id - b.id);
  return { date, published, slots };
}

export async function todayAttendanceSessions(termId: number, date: string, groupIds: number[]) {
  if (!groupIds.length) return [];
  return db.select({ id: attendanceSessions.id, groupId: attendanceSessions.teachingGroupId,
    startMinutes: attendanceSessions.startMinutes, endMinutes: attendanceSessions.endMinutes })
    .from(attendanceSessions).where(and(eq(attendanceSessions.termId, termId),
      eq(attendanceSessions.classDate, date), inArray(attendanceSessions.teachingGroupId, groupIds), ne(attendanceSessions.status, "voided")));
}

export function attendanceSlotKey(date: string, slot: { id: number; startMinutes: number; endMinutes: number }) {
  return `${date}.${slot.id}.${slot.startMinutes}.${slot.endMinutes}`;
}
