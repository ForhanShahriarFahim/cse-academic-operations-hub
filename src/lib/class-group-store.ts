/** CRS-01C injected class-group evidence and writes; no configured client import. */
import { createHash } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { academicTerms, attendanceSessions, auditEvents, batches, batchTermPlacements, courseEnrollments, courseOfferings, courses, departments, extraLoadClasses, meetingTeachers, meetings, teachers, teachingGroupOfferings, teachingGroups, teachingRequirements, workloadAllocations } from "@/db/schema";
import { hasCapability, type Actor } from "./auth/policy";
import { conflicted, denied, invalid, stale, succeeded, type ActionResult } from "./action-result";
import { WORKLOAD_ADVISORY_UNITS } from "./constants";
import { cohortName, offeringLive } from "./offering-records";
import { EXTERNAL_LABEL_MAX, NOTES_MAX, allocationMethod, externalCount, formatUnits, groupInteger, groupReason, groupStates, groupTermEditable, groupUsed, optionalText, parseDelivery, parseRequirement, parseTeachers, scheduleState, storedUnits, usageText, type Requirement, type TeacherEntry, type GroupState, type GroupUsage, type ScheduleState } from "./class-group-records";
import { lockTermContext } from "./term-lock";

export type ClassGroupTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ClassGroupReader = Pick<ClassGroupTx, "select">;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export interface GroupCourseView { id: number; code: string; title: string; credits: string; courseType: string; isActive: boolean }
export interface GroupAudienceView { offeringId: number; batchId: number; name: string; stream: string; semester: number | null; offeringStatus: string; batchStatus: string }
export interface GroupTeacherView { teacherId: number; code: string; name: string; status: string; units: number; method: string }
export interface ClassGroupView {
  id: number; course: GroupCourseView; deliveryMode: string; audiences: GroupAudienceView[];
  externalLabel: string | null; externalCount: number | null; notes: string | null; pendingReconciliation: boolean;
  teachers: GroupTeacherView[]; method: string | null;
  requirement: { meetings: number; minutes: number | null; provisional: boolean } | null;
  usage: GroupUsage; lockedTeacherIds: number[]; scheduledMeetings: number; scheduledMinutes: number;
  states: GroupState[]; schedule: ScheduleState; problems: string[]; fingerprint: string;
}
export interface UngroupedView { offeringId: number; course: GroupCourseView; batchId: number; cohort: string; stream: string; semester: number | null; status: string; batchStatus: string }
export interface TeacherOption { id: number; code: string; name: string; status: string; total: number; limit: number }
export interface CourseSuggestion { courseId: number; units: number | null; meetings: number | null; minutes: number | null; from: string }
export interface TermClassGroupsView {
  term: { id: number; name: string; status: string }; editable: boolean;
  groups: ClassGroupView[]; ungrouped: UngroupedView[]; teachers: TeacherOption[]; suggestions: CourseSuggestion[];
  totals: { groups: number; merged: number; vacancy: number; noRequirement: number; ungrouped: number; unscheduled: number; reconcile: number };
}
export interface ClassGroupResult extends ActionResult { fingerprint?: string }

const courseView = (course: typeof courses.$inferSelect): GroupCourseView => ({ id: course.id, code: course.code, title: course.title, credits: course.credits, courseType: course.courseType, isActive: course.isActive });
const unknownCourse = (id: number): GroupCourseView => ({ id, code: `Unknown course #${id}`, title: "Missing catalog record", credits: "0.0", courseType: "unknown", isActive: false });
const tally = (rows: Array<{ groupId: number; total: number }>) => new Map(rows.map(row => [row.groupId, Number(row.total)]));

/** One term's class groups with everything the list, the forms and the write decisions need. */
export async function termClassGroups(reader: ClassGroupReader, termId: number): Promise<TermClassGroupsView | null> {
  const [term] = await reader.select().from(academicTerms).where(eq(academicTerms.id, termId));
  if (!term) return null;
  const groupRows = await reader.select().from(teachingGroups).where(eq(teachingGroups.termId, term.id)).orderBy(teachingGroups.id);
  const groupIds = groupRows.map(group => group.id);
  const termOfferings = await reader.select().from(courseOfferings).where(eq(courseOfferings.termId, term.id)).orderBy(courseOfferings.id);
  const ownLinks = groupIds.length ? await reader.select().from(teachingGroupOfferings).where(inArray(teachingGroupOfferings.teachingGroupId, groupIds)).orderBy(teachingGroupOfferings.id) : [];
  const offeringLinks = termOfferings.length ? await reader.select().from(teachingGroupOfferings).where(inArray(teachingGroupOfferings.offeringId, termOfferings.map(row => row.id))).orderBy(teachingGroupOfferings.id) : [];
  const links = [...new Map([...ownLinks, ...offeringLinks].map(link => [link.id, link])).values()];
  // A legacy link may point at another term's offering; load it so the problem can be named.
  const foreignIds = [...new Set(ownLinks.map(link => link.offeringId))].filter(id => !termOfferings.some(row => row.id === id));
  const foreign = foreignIds.length ? await reader.select().from(courseOfferings).where(inArray(courseOfferings.id, foreignIds)) : [];
  const offeringById = new Map([...termOfferings, ...foreign].map(row => [row.id, row]));
  const placed = await reader.select({ b: batches, p: batchTermPlacements }).from(batchTermPlacements).innerJoin(batches, eq(batches.id, batchTermPlacements.batchId)).where(eq(batchTermPlacements.termId, term.id));
  const semesterByBatch = new Map(placed.map(({ b, p }) => [b.id, p.semester]));
  const batchIds = [...new Set([...offeringById.values()].map(row => row.batchId))];
  const batchRows = batchIds.length ? await reader.select().from(batches).where(inArray(batches.id, batchIds)) : [];
  const batchById = new Map(batchRows.map(batch => [batch.id, batch]));
  const courseIds = [...new Set([...groupRows.map(group => group.courseId), ...termOfferings.map(row => row.courseId)])];
  const courseRows = courseIds.length ? await reader.select().from(courses).where(inArray(courses.id, courseIds)) : [];
  const courseById = new Map(courseRows.map(course => [course.id, courseView(course)]));
  const requirementRows = groupIds.length ? await reader.select().from(teachingRequirements).where(inArray(teachingRequirements.teachingGroupId, groupIds)).orderBy(teachingRequirements.id) : [];
  const groupAllocations = groupIds.length ? await reader.select().from(workloadAllocations).where(inArray(workloadAllocations.teachingGroupId, groupIds)).orderBy(workloadAllocations.id) : [];
  const termAllocations = await reader.select({ teacherId: workloadAllocations.teacherId, units: workloadAllocations.units }).from(workloadAllocations).where(eq(workloadAllocations.termId, term.id));
  const teacherRows = await reader.select().from(teachers).orderBy(teachers.shortCode, teachers.id);
  const teacherById = new Map(teacherRows.map(teacher => [teacher.id, teacher]));
  const meetingRows = groupIds.length ? await reader.select({ id: meetings.id, groupId: meetings.teachingGroupId, start: meetings.startMinutes, end: meetings.endMinutes, status: meetings.status }).from(meetings).where(inArray(meetings.teachingGroupId, groupIds)).orderBy(meetings.id) : [];
  const meetingTeacherRows = meetingRows.length ? await reader.select({ meetingId: meetingTeachers.meetingId, teacherId: meetingTeachers.teacherId }).from(meetingTeachers).where(inArray(meetingTeachers.meetingId, meetingRows.map(row => row.id))).orderBy(meetingTeachers.id) : [];
  const enrollments = tally(groupIds.length ? await reader.select({ groupId: courseEnrollments.teachingGroupId, total: count() }).from(courseEnrollments).where(inArray(courseEnrollments.teachingGroupId, groupIds)).groupBy(courseEnrollments.teachingGroupId) : []);
  const sessions = tally(groupIds.length ? await reader.select({ groupId: attendanceSessions.teachingGroupId, total: count() }).from(attendanceSessions).where(inArray(attendanceSessions.teachingGroupId, groupIds)).groupBy(attendanceSessions.teachingGroupId) : []);
  const claimRows = groupIds.length ? await reader.select({ groupId: extraLoadClasses.teachingGroupId, total: count() }).from(extraLoadClasses).where(inArray(extraLoadClasses.teachingGroupId, groupIds)).groupBy(extraLoadClasses.teachingGroupId) : [];
  const claims = tally(claimRows.flatMap(row => row.groupId == null ? [] : [{ groupId: row.groupId, total: row.total }]));

  const groupsOfOffering = new Map<number, number[]>();
  for (const link of links) groupsOfOffering.set(link.offeringId, [...(groupsOfOffering.get(link.offeringId) ?? []), link.teachingGroupId]);
  const meetingGroup = new Map(meetingRows.map(row => [row.id, row.groupId]));

  const groups: ClassGroupView[] = groupRows.map(group => {
    const mine = ownLinks.filter(link => link.teachingGroupId === group.id), requirements = requirementRows.filter(row => row.teachingGroupId === group.id), allocations = groupAllocations.filter(row => row.teachingGroupId === group.id);
    const problems: string[] = [];
    const audiences: GroupAudienceView[] = mine.flatMap(link => {
      const offering = offeringById.get(link.offeringId), batch = offering ? batchById.get(offering.batchId) : undefined;
      if (!offering || !batch) { problems.push("It is linked to an offering that no longer exists."); return []; }
      if (offering.termId !== term.id) problems.push(`Its audience ${cohortName(batch)} belongs to another term's offering.`);
      if (offering.courseId !== group.courseId) problems.push(`Its audience ${cohortName(batch)} is offered a different course.`);
      if ((groupsOfOffering.get(offering.id) ?? []).length > 1) problems.push(`${cohortName(batch)}'s offering is also in another class group.`);
      return [{ offeringId: offering.id, batchId: batch.id, name: cohortName(batch), stream: batch.stream, semester: offering.termId === term.id ? semesterByBatch.get(batch.id) ?? null : null, offeringStatus: offering.status, batchStatus: batch.status }];
    }).sort((a, b) => a.name.localeCompare(b.name) || a.offeringId - b.offeringId);
    if (!mine.length && !group.externalAudienceLabel) problems.push("It has no audience recorded.");
    if (requirements.length > 1) problems.push(`It has ${requirements.length} weekly requirements recorded.`);
    if (new Set(allocations.map(row => row.teacherId)).size !== allocations.length) problems.push("A teacher has more than one allocation for it.");
    if (allocations.some(row => row.termId !== term.id)) problems.push("An allocation for it is recorded under another term.");
    if (allocations.some(row => storedUnits(row.units) == null)) problems.push("An allocation has unreadable units.");
    const teacherViews: GroupTeacherView[] = allocations.map(row => { const teacher = teacherById.get(row.teacherId); return { teacherId: row.teacherId, code: teacher?.shortCode ?? `#${row.teacherId}`, name: teacher?.fullName ?? "Missing teacher record", status: teacher?.status ?? "missing", units: storedUnits(row.units) ?? 0, method: row.allocationMethod }; })
      .sort((a, b) => a.code.localeCompare(b.code) || a.teacherId - b.teacherId);
    const methods = [...new Set(teacherViews.map(row => row.method))];
    const method = !teacherViews.length ? null : teacherViews.length === 1 ? "sole" : methods.length === 1 ? methods[0] : null;
    const requirement = requirements[0] ? { meetings: requirements[0].requiredMeetingsPerWeek, minutes: requirements[0].expectedWeeklyMinutes, provisional: requirements[0].status === "provisional" } : null;
    const scheduled = meetingRows.filter(row => row.groupId === group.id), lockedTeacherIds = [...new Set(meetingTeacherRows.filter(row => meetingGroup.get(row.meetingId) === group.id).map(row => row.teacherId))].sort((a, b) => a - b);
    const usage: GroupUsage = { meetings: scheduled.length, enrollments: enrollments.get(group.id) ?? 0, sessions: sessions.get(group.id) ?? 0, claims: claims.get(group.id) ?? 0 };
    const scheduledMinutes = scheduled.reduce((total, row) => total + row.end - row.start, 0);
    const facts = { deliveryMode: group.deliveryMode, teacherCount: teacherViews.length, hasMeetingTeacher: lockedTeacherIds.length > 0, requirement, scheduledMeetings: scheduled.length, scheduledMinutes, problems: problems.length };
    return {
      id: group.id, course: courseById.get(group.courseId) ?? unknownCourse(group.courseId), deliveryMode: group.deliveryMode, audiences,
      externalLabel: group.externalAudienceLabel, externalCount: group.externalStudentCount, notes: group.notes, pendingReconciliation: group.pendingReconciliation,
      teachers: teacherViews, method, requirement, usage, lockedTeacherIds, scheduledMeetings: scheduled.length, scheduledMinutes,
      states: groupStates(facts), schedule: scheduleState(facts), problems: [...new Set(problems)],
      fingerprint: hash({ term: [term.id, term.status], group, links: mine.map(link => [link.id, link.offeringId, offeringById.get(link.offeringId)?.status ?? null]), requirements, allocations, usage, lockedTeacherIds }),
    };
  }).sort((a, b) => a.course.code.localeCompare(b.course.code) || (a.audiences[0]?.name ?? "").localeCompare(b.audiences[0]?.name ?? "") || a.id - b.id);

  const ungrouped: UngroupedView[] = termOfferings.filter(row => offeringLive(row.status) && !groupsOfOffering.has(row.id)).flatMap(row => {
    const batch = batchById.get(row.batchId); if (!batch) return [];
    return [{ offeringId: row.id, course: courseById.get(row.courseId) ?? unknownCourse(row.courseId), batchId: batch.id, cohort: cohortName(batch), stream: batch.stream, semester: semesterByBatch.get(batch.id) ?? null, status: row.status, batchStatus: batch.status }];
  }).sort((a, b) => a.course.code.localeCompare(b.course.code) || a.cohort.localeCompare(b.cohort) || a.offeringId - b.offeringId);

  const totals = new Map<number, number>();
  for (const row of termAllocations) totals.set(row.teacherId, (totals.get(row.teacherId) ?? 0) + (storedUnits(row.units) ?? 0));
  const teacherOptions: TeacherOption[] = teacherRows.filter(teacher => !["vacancy", "unresolved"].includes(teacher.status)).map(teacher => ({ id: teacher.id, code: teacher.shortCode, name: teacher.fullName, status: teacher.status, total: totals.get(teacher.id) ?? 0, limit: storedUnits(teacher.advisoryLoadUnits ?? WORKLOAD_ADVISORY_UNITS) ?? WORKLOAD_ADVISORY_UNITS * 100 }));

  // Suggestions come from the most recent class group of the same course in any term (latest start date, then newest).
  const wanted = [...new Set(ungrouped.map(row => row.course.id))];
  const earlier = wanted.length ? await reader.select({ g: teachingGroups, t: academicTerms }).from(teachingGroups).innerJoin(academicTerms, eq(academicTerms.id, teachingGroups.termId)).where(inArray(teachingGroups.courseId, wanted)).orderBy(academicTerms.startDate, teachingGroups.id) : [];
  const latest = new Map<number, typeof earlier[number]>(); for (const row of earlier) latest.set(row.g.courseId, row);
  const latestIds = [...latest.values()].map(row => row.g.id);
  const latestRequirements = latestIds.length ? await reader.select().from(teachingRequirements).where(inArray(teachingRequirements.teachingGroupId, latestIds)).orderBy(teachingRequirements.id) : [];
  const latestAllocations = latestIds.length ? await reader.select().from(workloadAllocations).where(inArray(workloadAllocations.teachingGroupId, latestIds)).orderBy(workloadAllocations.id) : [];
  const suggestions: CourseSuggestion[] = [...latest.values()].map(({ g, t }) => {
    const requirement = latestRequirements.find(row => row.teachingGroupId === g.id), allocation = latestAllocations.find(row => row.teachingGroupId === g.id);
    return { courseId: g.courseId, units: allocation ? storedUnits(allocation.units) : null, meetings: requirement && g.deliveryMode !== "teacher_managed" ? requirement.requiredMeetingsPerWeek : null, minutes: requirement?.expectedWeeklyMinutes ?? null, from: t.name };
  });

  return {
    term: { id: term.id, name: term.name, status: term.status }, editable: groupTermEditable(term.status), groups, ungrouped, teachers: teacherOptions, suggestions,
    totals: { groups: groups.length, merged: groups.filter(group => group.audiences.length > 1).length, vacancy: groups.filter(group => group.states.includes("vacancy")).length, noRequirement: groups.filter(group => group.states.includes("no_requirement")).length, ungrouped: ungrouped.length, unscheduled: groups.filter(group => group.schedule === "unscheduled").length, reconcile: groups.filter(group => group.problems.length > 0).length },
  };
}

const STALE = "This class group changed since you opened this page. Review the current details before saving.";
const reasonError = { reason: ["Use 1–300 plain-text characters without personal/student details."] };
const audienceLabel = (names: string[], external: string | null) => [...names, ...(external ? [external] : [])].join(" and ") || "no audience";

export async function auditClassGroup(tx: ClassGroupTx, actor: Actor, action: string, termId: number, before: unknown, after: unknown, detail: Record<string, unknown>) {
  await tx.insert(auditEvents).values({ actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user", action, entity: "term_class_groups", entityId: termId, before, after, detail });
}
/** Persist validated class-group facts inside the caller's existing transaction. */
export async function insertClassGroup(tx: ClassGroupTx, values: typeof teachingGroups.$inferInsert, offeringIds: number[], requirement: Requirement, allocations: TeacherEntry[], method: string | null) {
  const [group] = await tx.insert(teachingGroups).values(values).returning({ id: teachingGroups.id });
  await tx.insert(teachingGroupOfferings).values(offeringIds.map(offeringId => ({ teachingGroupId: group.id, offeringId })));
  await tx.insert(teachingRequirements).values({ teachingGroupId: group.id, requiredMeetingsPerWeek: requirement.meetings, expectedWeeklyMinutes: requirement.minutes, status: requirement.provisional ? "provisional" : "approved" });
  if (allocations.length) {
    if (!method) throw new Error("Allocations require a crediting method.");
    await tx.insert(workloadAllocations).values(allocations.map(row => ({ teacherId: row.teacherId, termId: values.termId, teachingGroupId: group.id, units: formatUnits(row.units), allocationMethod: method })));
  }
  return group.id;
}

const snapshot = (input: { audience: string[]; externalLabel: string | null; externalCount: number | null; deliveryMode: string; requirement: { meetings: number; minutes: number | null; provisional: boolean } | null; teachers: Array<{ code: string; units: number }>; method: string | null; notes: string | null }) => ({
  audience: [...input.audience].sort(), externalLabel: input.externalLabel, externalCount: input.externalCount, deliveryMode: input.deliveryMode,
  requirement: input.requirement, teachers: [...input.teachers].sort((a, b) => a.code.localeCompare(b.code)).map(row => ({ code: row.code, units: formatUnits(row.units) })), method: input.method, notes: input.notes,
});

/**
 * Standalone transaction only: shared context lock, then this term's row, then
 * the chosen teacher rows. The shared lock serializes with exclusive catalog,
 * cohort-lifecycle and rollover writers; the term row serializes class-group
 * and offering editors of one term; teacher rows serialize with teacher lifecycle.
 */
export async function changeClassGroupInTransaction(tx: ClassGroupTx, actor: Actor, raw: Record<string, unknown>, lists: { offerings: unknown[]; teacherIds: unknown[]; units: unknown[] } = { offerings: [], teacherIds: [], units: [] }): Promise<ClassGroupResult> {
  const [scope] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.code, "CSE"));
  if (!hasCapability(actor, "manage_class_groups", scope?.id ?? null)) return denied("You do not have permission to manage class groups.", "forbidden");
  await lockTermContext(tx, "share");
  const command = String(raw.command), termId = groupInteger(raw.termId);
  if (!["create", "update", "remove"].includes(command)) return invalid("Choose a supported class-group action.");
  if (!termId) return invalid("Invalid term. Reload before saving.");
  const [term] = await tx.select().from(academicTerms).where(eq(academicTerms.id, termId)).for("update");
  if (!term) return stale("This academic term no longer exists.", "missing");
  if (!groupTermEditable(term.status)) return conflicted("This term's class groups are read-only.", [{ severity: "blocker", title: "Term is not draft or active", detail: `${term.name} is ${term.status}. Its class groups are kept for reference and cannot be changed.` }]);
  const view = (await termClassGroups(tx, term.id))!;
  const reason = groupReason(raw.reason);
  if (raw.reason != null && raw.reason !== "" && !reason) return invalid("Check the reason.", reasonError);

  let current: ClassGroupView | null = null;
  if (command !== "create") {
    const groupId = groupInteger(raw.groupId);
    if (!groupId) return invalid("Invalid class group. Reload before saving.");
    current = view.groups.find(group => group.id === groupId) ?? null;
    if (!current) return stale("This class group no longer exists in this term.", "missing");
    if (raw.fingerprint !== current.fingerprint) return { ...stale(STALE), fingerprint: current.fingerprint };
    if (current.problems.length) return conflicted("This class group needs reconciliation and cannot be changed here.", current.problems.map(detail => ({ severity: "blocker" as const, title: "Stored record needs correction", detail })));
  }
  const names = (group: ClassGroupView) => audienceLabel(group.audiences.map(audience => audience.name), group.externalLabel);

  if (command === "remove") {
    const group = current!;
    if (groupUsed(group.usage)) return conflicted("This class group cannot be removed.", [{ severity: "blocker", title: "Already in use", detail: `It has ${usageText(group.usage)}. A class group can be removed only before it is used.` }]);
    if (raw.confirmation !== group.course.code) return invalid("Type the course code to confirm removal.", { confirmation: [`Type ${group.course.code} exactly.`] });
    if (!reason) return invalid("Enter a reason for removing.", reasonError);
    await tx.delete(workloadAllocations).where(eq(workloadAllocations.teachingGroupId, group.id));
    await tx.delete(teachingRequirements).where(eq(teachingRequirements.teachingGroupId, group.id));
    await tx.delete(teachingGroupOfferings).where(eq(teachingGroupOfferings.teachingGroupId, group.id));
    await tx.delete(teachingGroups).where(and(eq(teachingGroups.id, group.id), eq(teachingGroups.termId, term.id)));
    const before = snapshot({ audience: group.audiences.map(audience => audience.name), externalLabel: group.externalLabel, externalCount: group.externalCount, deliveryMode: group.deliveryMode, requirement: group.requirement, teachers: group.teachers, method: group.method, notes: group.notes });
    await auditClassGroup(tx, actor, "class_group.remove", term.id, before, null, { reason, groupId: group.id, course: group.course.code, courseId: group.course.id, audience: names(group) });
    return succeeded(`The class group for ${group.course.code} (${names(group)}) was removed. Its offerings are unchanged.`, { entityId: term.id });
  }

  // Shared parsing for create and update.
  const courseId = current ? current.course.id : groupInteger(raw.courseId);
  if (!courseId) return invalid("Choose a course.", { courseId: ["Choose a course."] });
  const offeringIds = lists.offerings.map(groupInteger);
  if (offeringIds.some(id => !id)) return invalid("Review the ticked cohorts and submit again.", { offering: ["Unsupported selection."] });
  const wanted = [...new Set(offeringIds as number[])].sort((a, b) => a - b);
  const delivery = parseDelivery(raw.delivery);
  if (!delivery) return invalid("Choose how this class is delivered.", { delivery: ["Choose fixed weekly classes or teacher-managed."] });
  const parsedRequirement = parseRequirement(delivery, raw.meetings, raw.minutes, raw.provisional);
  if (!parsedRequirement.ok) return invalid("Check the weekly requirement.", parsedRequirement.errors);
  const parsedTeachers = parseTeachers(lists.teacherIds, lists.units);
  if (!parsedTeachers.ok) return invalid(parsedTeachers.message, { teachers: [parsedTeachers.message] });
  const method = allocationMethod(parsedTeachers.rows.length, raw.method);
  if (parsedTeachers.rows.length > 1 && !method) return invalid("Choose how the teachers are credited.", { method: ["Choose “each credited in full” or “split between them”."] });
  const externalLabel = optionalText(raw.externalLabel, EXTERNAL_LABEL_MAX), external = externalCount(raw.externalCount), notes = optionalText(raw.notes, NOTES_MAX);
  if (externalLabel === undefined) return invalid("Check the outside audience.", { externalLabel: [`Use up to ${EXTERNAL_LABEL_MAX} plain-text characters.`] });
  if (external === undefined) return invalid("Check the outside student count.", { externalCount: ["Enter a whole number, or leave it blank when unknown."] });
  if (external != null && !externalLabel) return invalid("Name the outside audience before giving its count.", { externalLabel: ["Enter who the outside students are."] });
  if (notes === undefined) return invalid("Check the notes.", { notes: [`Use up to ${NOTES_MAX} plain-text characters without student details.`] });

  // Audience: offerings of this course in this term, each in no other class group.
  const currentIds = current ? current.audiences.map(audience => audience.offeringId).sort((a, b) => a - b) : [];
  const audienceChanged = wanted.length !== currentIds.length || wanted.some((id, index) => id !== currentIds[index]);
  if (!wanted.length) return invalid("Tick at least one cohort.", { offering: ["A class group needs at least one cohort."] });
  if (current && audienceChanged && groupUsed(current.usage)) return conflicted("The audience of this class group is fixed.", [{ severity: "blocker", title: "Already in use", detail: `It has ${usageText(current.usage)}. Clash and room-size checks for its classes depend on who attends.` }]);
  const added = wanted.filter(id => !currentIds.includes(id));
  const addedRows: UngroupedView[] = [];
  for (const id of added) {
    const free = view.ungrouped.find(row => row.offeringId === id);
    if (!free) {
      const holder = view.groups.find(group => group.audiences.some(audience => audience.offeringId === id));
      return holder ? conflicted("One of the ticked cohorts is already in another class group.", [{ severity: "blocker", title: "An offering belongs to one class group", detail: `${holder.audiences.find(audience => audience.offeringId === id)!.name}'s ${holder.course.code} is already in a class group. Nothing was saved.` }])
        : invalid("One of the ticked cohorts is no longer offered this course. Review the current list.", { offering: ["Review the cohorts."] });
    }
    if (free.course.id !== courseId) return invalid("Every ticked cohort must be offered the chosen course.", { offering: ["Choose cohorts of one course."] });
    if (free.batchStatus !== "active") return invalid(`${free.cohort} is not an active cohort.`, { offering: ["Only active cohorts can join a class group."] });
    addedRows.push(free);
  }
  const course = current ? current.course : addedRows[0]?.course;
  if (!course) return invalid("Choose a course.", { courseId: ["Choose a course."] });
  if (!current && !course.isActive) return invalid(`${course.code} is inactive. Reactivate it in the catalog before creating a class group.`, { courseId: ["This course is inactive."] });
  if (current && delivery !== current.deliveryMode && current.usage.meetings) return conflicted("The delivery of this class group is fixed.", [{ severity: "blocker", title: "Already scheduled", detail: `It has ${usageText({ ...current.usage, enrollments: 0, sessions: 0, claims: 0 })}. Remove them from the routine before changing how it is delivered.` }]);

  // Teachers: lock the rows, then decide. Newly added teachers must be active.
  const ids = parsedTeachers.rows.map(row => row.teacherId).sort((a, b) => a - b);
  const teacherRows = ids.length ? await tx.select().from(teachers).where(inArray(teachers.id, ids)).orderBy(teachers.id).for("update") : [];
  const existingIds = new Set(current?.teachers.map(row => row.teacherId) ?? []);
  for (const entry of parsedTeachers.rows) {
    const teacher = teacherRows.find(row => row.id === entry.teacherId);
    if (!teacher) return invalid("One of the teachers no longer exists.", { teachers: ["Review the teachers."] });
    if (!existingIds.has(teacher.id) && teacher.status !== "active") return invalid(`${teacher.shortCode} is ${teacher.status === "on_leave" ? "on leave" : teacher.status === "inactive" ? "inactive" : "not an assignable teacher"}. Only active teachers can be added.`, { teachers: [`${teacher.shortCode} cannot be added.`] });
  }
  const removedLocked = current ? current.teachers.filter(row => !ids.includes(row.teacherId) && current!.lockedTeacherIds.includes(row.teacherId)) : [];
  if (removedLocked.length) return conflicted("A teacher of this class group still teaches its scheduled classes.", removedLocked.map(row => ({ severity: "blocker" as const, title: `${row.code} teaches a scheduled class`, detail: "Change that class in the Routine builder before removing this teacher here." })));
  const code = (teacherId: number) => teacherRows.find(row => row.id === teacherId)!.shortCode;
  const desiredTeachers = parsedTeachers.rows.map(row => ({ ...row, code: code(row.teacherId) }));
  const keptNames = current ? current.audiences.filter(audience => wanted.includes(audience.offeringId)).map(audience => audience.name) : [];
  const after = snapshot({ audience: [...keptNames, ...addedRows.map(row => row.cohort)], externalLabel, externalCount: externalLabel ? external : null, deliveryMode: delivery, requirement: parsedRequirement.requirement, teachers: desiredTeachers, method, notes });
  const label = audienceLabel(after.audience, externalLabel);

  if (!current) {
    const groupId = await insertClassGroup(tx, { termId: term.id, courseId: course.id, deliveryMode: delivery, externalAudienceLabel: externalLabel, externalStudentCount: externalLabel ? external : null, notes }, wanted, parsedRequirement.requirement, desiredTeachers, method);
    await auditClassGroup(tx, actor, "class_group.create", term.id, null, after, { reason, groupId, course: course.code, courseId: course.id, audience: label });
    return succeeded(`Class group created for ${course.code} (${label}).${wanted.length > 1 ? " The cohorts stay separate." : ""} No class, room or enrollment was created.`, { entityId: groupId });
  }

  const before = snapshot({ audience: current.audiences.map(audience => audience.name), externalLabel: current.externalLabel, externalCount: current.externalCount, deliveryMode: current.deliveryMode, requirement: current.requirement, teachers: current.teachers, method: current.method, notes: current.notes });
  if (JSON.stringify(before) === JSON.stringify(after)) return succeeded("Nothing changed.", { entityId: current.id });
  if (!reason) return invalid("Enter a reason for this change.", reasonError);
  await tx.update(teachingGroups).set({ deliveryMode: delivery, externalAudienceLabel: externalLabel, externalStudentCount: externalLabel ? external : null, notes }).where(and(eq(teachingGroups.id, current.id), eq(teachingGroups.termId, term.id)));
  const dropped = currentIds.filter(id => !wanted.includes(id));
  if (dropped.length) await tx.delete(teachingGroupOfferings).where(and(eq(teachingGroupOfferings.teachingGroupId, current.id), inArray(teachingGroupOfferings.offeringId, dropped)));
  if (added.length) await tx.insert(teachingGroupOfferings).values(added.map(offeringId => ({ teachingGroupId: current!.id, offeringId })));
  const requirementValues = { requiredMeetingsPerWeek: parsedRequirement.requirement.meetings, expectedWeeklyMinutes: parsedRequirement.requirement.minutes, status: parsedRequirement.requirement.provisional ? "provisional" : "approved" };
  if (current.requirement) await tx.update(teachingRequirements).set(requirementValues).where(eq(teachingRequirements.teachingGroupId, current.id));
  else await tx.insert(teachingRequirements).values({ teachingGroupId: current.id, ...requirementValues });
  const gone = current.teachers.filter(row => !ids.includes(row.teacherId)).map(row => row.teacherId);
  if (gone.length) await tx.delete(workloadAllocations).where(and(eq(workloadAllocations.teachingGroupId, current.id), inArray(workloadAllocations.teacherId, gone)));
  for (const row of desiredTeachers) {
    if (existingIds.has(row.teacherId)) await tx.update(workloadAllocations).set({ units: formatUnits(row.units), allocationMethod: method! }).where(and(eq(workloadAllocations.teachingGroupId, current.id), eq(workloadAllocations.teacherId, row.teacherId)));
    else await tx.insert(workloadAllocations).values({ teacherId: row.teacherId, termId: term.id, teachingGroupId: current.id, units: formatUnits(row.units), allocationMethod: method! });
  }
  await auditClassGroup(tx, actor, "class_group.update", term.id, before, after, { reason, groupId: current.id, course: current.course.code, courseId: current.course.id, audience: label });
  return succeeded(`Class group for ${current.course.code} (${label}) saved.`, { entityId: current.id });
}
