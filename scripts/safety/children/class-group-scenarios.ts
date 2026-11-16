/** Real class-group actions/authorization/loaders with controlled request/session boundaries. */
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { loadApp, report, signInAs } from "./controlled-runtime";
import { fingerprintDatabase } from "../fingerprint";
import { setAuditInsertFault } from "../faults";
import type { ClassGroupResult, ClassGroupView } from "../../../src/lib/class-group-store";
import { creditingOf, formatUnits } from "../../../src/lib/class-group-records";
import { renderToStaticMarkup } from "react-dom/server";
const { db } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const actions = loadApp<typeof import("../../../src/lib/class-group-actions")>("src/lib/class-group-actions.ts");
const data = loadApp<typeof import("../../../src/lib/class-group-data")>("src/lib/class-group-data.ts");
const portal = loadApp<typeof import("../../../src/lib/data")>("src/lib/data.ts");
const context = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const listPage = loadApp<typeof import("../../../src/app/(portal)/terms/[id]/groups/page")>("src/app/(portal)/terms/[id]/groups/page.tsx");
const client = (db as unknown as { $client: import("../database").Queryable }).$client;
type Teachers = Array<[number | string, string]>;
const form = (values: Record<string, unknown>, offerings: Array<number | string> = [], teachers: Teachers = []) => {
  const f = new FormData(); for (const [key, value] of Object.entries(values)) if (value !== undefined) f.set(key, String(value));
  for (const offering of offerings) f.append("offering", String(offering));
  for (const [teacherId, units] of teachers) { f.append("teacherId", String(teacherId)); f.append("units", units); }
  return f;
};
const call = (values: Record<string, unknown>, offerings: Array<number | string> = [], teachers: Teachers = []) => actions.changeClassGroupAction(null, form(values, offerings, teachers));
const ok = (result: ClassGroupResult) => { assert.equal(result.ok, true, result.message); return result; };
const kind = (result: ClassGroupResult) => result.outcome?.kind;
const noWrite = async (work: () => Promise<ClassGroupResult>) => { const before = await fingerprintDatabase(client); const result = await work(); assert.deepEqual(await fingerprintDatabase(client), before, result.message); return result; };
const events = async () => (await db.select().from(s.auditEvents).where(eq(s.auditEvents.entity, "term_class_groups"))).length;
const OWN_TABLES = ["public.teaching_groups", "public.teaching_group_offerings", "public.teaching_requirements", "public.workload_allocations", "public.audit_events"];

async function main() {
  const lines: string[] = []; signInAs("admin@example.invalid");
  const [cse, eee] = await db.select().from(s.departments).orderBy(s.departments.id);
  const [summer] = await db.select().from(s.academicTerms);
  const [sya, syb, syc] = await db.select().from(s.teachers).orderBy(s.teachers.id);
  const batch = async (stream: string, label: string) => (await db.select().from(s.batches).where(and(eq(s.batches.stream, stream), eq(s.batches.label, label))))[0];
  const hsc22b = await batch("HSC", "22B"), dip22b = await batch("DIPLOMA", "22B");
  const [theory, sessional] = await db.select().from(s.courses).orderBy(s.courses.id);
  const [thesis, retired, extra] = await db.insert(s.courses).values([
    { code: "SYN-4000", title: "Synthetic Thesis", credits: "3.0", courseType: "thesis", semester: 8 },
    { code: "SYN-4104", title: "Synthetic Retired", credits: "3.0", semester: 7, isActive: false },
    { code: "SYN-4103", title: "Synthetic Elective", credits: "3.0", semester: 7 },
  ]).returning();
  const [hsc23x] = await db.insert(s.batches).values([{ stream: "HSC", label: "23X", sortOrder: 4 }]).returning();
  const [fall] = await db.insert(s.academicTerms).values([{ name: "Fall 2026", academicYear: 2026, startDate: "2026-10-15", endDate: "2027-02-15", status: "draft" }]).returning();
  await db.insert(s.batchTermPlacements).values([{ batchId: hsc23x.id, termId: fall.id, semester: 7 }, { batchId: hsc22b.id, termId: fall.id, semester: 8 }, { batchId: dip22b.id, termId: fall.id, semester: 4 }]);
  const [a, b, c, d, e, f, g] = await db.insert(s.courseOfferings).values([
    { termId: fall.id, batchId: hsc23x.id, courseId: theory.id, status: "planned" }, { termId: fall.id, batchId: dip22b.id, courseId: theory.id, status: "planned" },
    { termId: fall.id, batchId: hsc22b.id, courseId: theory.id, status: "planned" }, { termId: fall.id, batchId: hsc23x.id, courseId: sessional.id, status: "planned" },
    { termId: fall.id, batchId: hsc22b.id, courseId: thesis.id, status: "planned" }, { termId: fall.id, batchId: hsc23x.id, courseId: retired.id, status: "planned" },
    { termId: fall.id, batchId: hsc23x.id, courseId: extra.id, status: "cancelled" },
  ]).returning();
  const [h] = await db.insert(s.courseOfferings).values([{ termId: summer.id, batchId: hsc22b.id, courseId: extra.id, status: "open" }]).returning();
  const view = async (termId = fall.id) => (await data.getTermClassGroups(String(termId)))!;
  const groupOf = async (groupId: number, termId = fall.id) => (await view(termId)).groups.find(group => group.id === groupId)!;
  const create = (values: Record<string, unknown>, offerings: Array<number | string>, teachers: Teachers = [], termId = fall.id) => call({ command: "create", termId, delivery: "fixed", meetings: "2", minutes: "150", ...values }, offerings, teachers);
  /** Sends the group's current state exactly as the edit form would, with overrides. */
  const edit = async (groupId: number, termId: number, changes: { values?: Record<string, unknown>; offerings?: Array<number | string>; teachers?: Teachers } = {}) => {
    const group: ClassGroupView = await groupOf(groupId, termId);
    return call({ command: "update", termId, groupId, fingerprint: group.fingerprint, delivery: group.deliveryMode, meetings: group.deliveryMode === "teacher_managed" ? undefined : group.requirement?.meetings ?? "", minutes: group.deliveryMode === "teacher_managed" ? undefined : group.requirement?.minutes ?? "", provisional: group.requirement?.provisional ? "on" : undefined, method: creditingOf(group.method) || undefined, externalLabel: group.externalLabel ?? "", externalCount: group.externalCount ?? "", notes: group.notes ?? "", reason: "Synthetic change", ...changes.values },
      changes.offerings ?? group.audiences.map(audience => audience.offeringId), changes.teachers ?? group.teachers.map(teacher => [teacher.teacherId, formatUnits(teacher.units)]));
  };
  const remove = async (groupId: number, termId: number, changes: Record<string, unknown> = {}) => { const group = await groupOf(groupId, termId); return call({ command: "remove", termId, groupId, fingerprint: group.fingerprint, confirmation: group.course.code, reason: "Synthetic removal", ...changes }); };
  const rowsOf = async (groupId: number) => ({
    group: (await db.select().from(s.teachingGroups).where(eq(s.teachingGroups.id, groupId)))[0],
    links: (await db.select().from(s.teachingGroupOfferings).where(eq(s.teachingGroupOfferings.teachingGroupId, groupId))).map(row => row.offeringId).sort((x, y) => x - y),
    requirements: await db.select().from(s.teachingRequirements).where(eq(s.teachingRequirements.teachingGroupId, groupId)),
    allocations: (await db.select().from(s.workloadAllocations).where(eq(s.workloadAllocations.teachingGroupId, groupId))).map(row => [row.teacherId, row.units, row.allocationMethod, row.termId]).sort(),
  });
  const purge = async (groupId: number) => { await db.delete(s.workloadAllocations).where(eq(s.workloadAllocations.teachingGroupId, groupId)); await db.delete(s.teachingRequirements).where(eq(s.teachingRequirements.teachingGroupId, groupId)); await db.delete(s.teachingGroupOfferings).where(eq(s.teachingGroupOfferings.teachingGroupId, groupId)); await db.delete(s.teachingGroups).where(eq(s.teachingGroups.id, groupId)); };

  // AC-01 permissions.
  for (const [index, role, departmentId, allowed] of [[0, "academic_administrator", null, true], [1, "system_administrator", cse.id, true], [2, "routine_coordinator", null, true], [3, "academic_administrator", eee.id, false], [4, "teacher", null, false], [5, "read_only_viewer", null, false], [6, "department_approver", null, false], [7, "accounts_officer", null, false]] as const) {
    const email = `class-group-role-${index}@example.invalid`;
    const [user] = await db.insert(s.portalUsers).values({ email, displayName: `Synthetic class-group role ${index}`, status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role, departmentId }); signInAs(email);
    if (departmentId === eee.id) await assert.rejects(view());
    else { const visible = await view(); assert.equal(visible.editor, allowed); assert.equal(visible.canEdit, allowed); assert.ok(visible.ungrouped.length, "viewers read the page"); assert.equal(visible.teachers.length > 0, allowed, "the teacher directory with totals is editor-only"); }
    const summerView = departmentId === eee.id ? null : await view(summer.id);
    if (summerView) assert.equal(summerView.groups.every(group => !!group.fingerprint), allowed, "review tokens are editor-only");
    const attempt = () => create({ courseId: theory.id }, [c.id]);
    if (allowed) {
      ok(await attempt()); assert.ok((await data.getClassGroupChanges(fall.id)).changes.length); await purge((await view()).groups[0].id);
      await db.update(s.roleAssignments).set({ activeTo: new Date(0) }).where(eq(s.roleAssignments.userId, user.id));
      const before = await fingerprintDatabase(client); assert.equal(kind(await attempt()), "permission"); assert.deepEqual(await fingerprintDatabase(client), before);
    } else { assert.equal(kind(await noWrite(attempt)), "permission"); await assert.rejects(data.getClassGroupChanges(fall.id)); await assert.rejects(actions.loadClassGroupChangesAction(fall.id, 1)); }
  }
  signInAs(null); assert.equal(kind(await noWrite(() => create({ courseId: theory.id }, [c.id]))), "permission"); await assert.rejects(data.getTermClassGroups(String(fall.id))); await assert.rejects(data.getClassGroupChanges(fall.id));
  signInAs("admin@example.invalid");
  await db.delete(s.auditEvents).where(eq(s.auditEvents.entity, "term_class_groups"));
  lines.push("Real entry-point permission matrix: global/CSE administrators and routine coordinators create class groups and read history; other-department-only administrator, teacher, viewer, approver, accounts, revoked and anonymous cannot mutate or load history. Non-editor internal roles read the page without review tokens or the teacher directory.");

  const generation = (await context.readTermContext()).generation;
  const baseline = await fingerprintDatabase(client);

  // AC-03 audience.
  const start = await view(); assert.deepEqual(start.groups, []); assert.deepEqual(start.ungrouped.map(row => row.offeringId).sort((x, y) => x - y), [a.id, b.id, c.id, d.id, e.id, f.id].sort((x, y) => x - y), "cancelled offerings are not waiting for a group");
  for (const [label, attempt] of [
    ["no cohort", () => create({ courseId: theory.id }, [])], ["mixed courses", () => create({ courseId: theory.id }, [a.id, d.id])], ["another term's offering", () => create({ courseId: extra.id }, [h.id])],
    ["cancelled offering", () => create({ courseId: extra.id }, [g.id])], ["inactive course", () => create({ courseId: retired.id }, [f.id])], ["forged id", () => create({ courseId: theory.id }, ["1e3"])],
    ["missing course", () => create({}, [a.id])], ["course not matching the cohorts", () => create({ courseId: sessional.id }, [a.id])],
  ] as Array<[string, () => Promise<ClassGroupResult>]>) assert.equal(kind(await noWrite(attempt)), "validation", label);
  await db.update(s.batches).set({ status: "inactive" }).where(eq(s.batches.id, dip22b.id));
  assert.equal(kind(await noWrite(() => create({ courseId: theory.id }, [a.id, b.id]))), "validation", "inactive cohort");
  await db.update(s.batches).set({ status: "active" }).where(eq(s.batches.id, dip22b.id));
  ok(await create({ courseId: theory.id, externalLabel: " EEE-23X ", externalCount: "" }, [a.id, b.id, a.id])); const merged = (await view()).groups[0].id;
  assert.deepEqual((await rowsOf(merged)).links, [a.id, b.id].sort((x, y) => x - y)); assert.equal((await rowsOf(merged)).group.externalAudienceLabel, "EEE-23X"); assert.equal((await rowsOf(merged)).group.externalStudentCount, null);
  const mergedView = await groupOf(merged); assert.deepEqual(mergedView.audiences.map(audience => audience.name), ["DIP-22B", "HSC-23X"]); assert.deepEqual(mergedView.states, ["vacancy"]); assert.equal(mergedView.problems.length, 0);
  assert.equal(kind(await noWrite(() => create({ courseId: theory.id }, [a.id]))), "conflict", "an offering belongs to one class group");
  assert.equal(kind(await noWrite(() => create({ courseId: theory.id }, [c.id, b.id]))), "conflict");
  assert.equal(kind(await noWrite(() => create({ courseId: theory.id, externalCount: "12" }, [c.id]))), "validation", "an outside count needs a label");
  assert.equal(kind(await noWrite(() => create({ courseId: theory.id, externalLabel: "x".repeat(41) }, [c.id]))), "validation");
  assert.equal((await db.select().from(s.courseOfferings).where(eq(s.courseOfferings.termId, fall.id))).length, 7, "cohorts keep their own offerings");
  lines.push("Audience rules: a class group needs at least one offered offering of its own course and term from an active cohort; cancelled, cross-term, cross-course, inactive-course and forged selections write nothing; a merged class links several offerings and leaves each cohort's offering untouched; an offering already in a class group is refused as a conflict.");

  // AC-04 teachers and units, AC-05 weekly requirement.
  for (const [label, teachers, values] of [
    ["inactive teacher", [[syc.id, "3.00"]], {}], ["unknown teacher", [[2147483000, "3.00"]], {}], ["duplicate teacher", [[sya.id, "1.00"], [sya.id, "1.00"]], { method: "full" }],
    ["units too small", [[sya.id, "0.10"]], {}], ["units too large", [[sya.id, "20.01"]], {}], ["three decimals", [[sya.id, "1.125"]], {}], ["blank units", [[sya.id, ""]], {}],
    ["no crediting choice", [[sya.id, "3.00"], [syb.id, "3.00"]], {}], ["unsupported crediting", [[sya.id, "3.00"], [syb.id, "3.00"]], { method: "sole" }],
    ["no meetings", [], { meetings: "" }], ["minutes out of range", [], { minutes: "20" }], ["unknown delivery", [], { delivery: "online" }], ["bad reason", [], { reason: "a\u0000b" }], ["long notes", [], { notes: "n".repeat(501) }],
  ] as Array<[string, Teachers, Record<string, unknown>]>) assert.equal(kind(await noWrite(() => create({ courseId: theory.id, ...values }, [c.id], teachers))), "validation", label);
  const totalOf = async (teacherId: number, termId = fall.id) => (await view(termId)).teachers.find(teacher => teacher.id === teacherId)!.total;
  assert.equal(await totalOf(sya.id), 0); assert.equal(await totalOf(sya.id, summer.id), 400); assert.equal(await totalOf(syb.id, summer.id), 400, "external commitments count in the term total");
  ok(await create({ courseId: theory.id, method: "full", provisional: "on", notes: " Synthetic note " }, [c.id], [[sya.id, "3"], [syb.id, "2.50"]]));
  const shared = (await view()).groups.find(group => group.audiences.some(audience => audience.offeringId === c.id))!.id, sharedRows = await rowsOf(shared);
  assert.deepEqual(sharedRows.allocations, [[sya.id, "3.00", "shared_policy", fall.id], [syb.id, "2.50", "shared_policy", fall.id]].sort()); assert.equal(sharedRows.group.notes, "Synthetic note");
  assert.deepEqual(sharedRows.requirements.map(row => [row.requiredMeetingsPerWeek, row.expectedWeeklyMinutes, row.status]), [[2, 150, "provisional"]]);
  assert.equal(await totalOf(sya.id), 300); assert.equal(await totalOf(syb.id), 250); assert.deepEqual((await groupOf(shared)).states, ["provisional", "ready"]);
  ok(await create({ courseId: thesis.id, delivery: "teacher_managed", meetings: "9", minutes: "9999" }, [e.id], [[sya.id, "3.00"]]));
  const managed = (await view()).groups.find(group => group.course.id === thesis.id)!.id;
  assert.deepEqual((await rowsOf(managed)).requirements.map(row => [row.requiredMeetingsPerWeek, row.expectedWeeklyMinutes, row.status]), [[1, null, "approved"]]); assert.deepEqual((await rowsOf(managed)).allocations, [[sya.id, "3.00", "sole", fall.id]]);
  assert.deepEqual((await groupOf(managed)).states, ["teacher_managed", "ready"]);
  // Suggestions name the most recent group of the same course.
  const hints = (await view()).suggestions; assert.deepEqual(hints.find(item => item.courseId === sessional.id), { courseId: sessional.id, units: 100, meetings: 1, minutes: 150, from: "Summer 2026" });
  lines.push("Teachers and units: inactive, unknown and duplicate teachers, malformed or out-of-range units and a missing crediting choice are refused; a vacancy is accepted; saved units, method and per-teacher term totals (including external commitments) match what was entered. Fixed delivery stores one requirement row with both numbers; teacher-managed delivery stores one row with no minutes. Suggestions come from the most recent class group of the same course.");

  // AC-06 changes after creation: unused draft group.
  const sharedEvents = await events();
  assert.equal((await noWrite(() => edit(shared, fall.id))).message, "Nothing changed."); assert.equal(await events(), sharedEvents, "a save that changes nothing writes no event");
  assert.equal(kind(await noWrite(() => edit(shared, fall.id, { values: { reason: "" }, teachers: [[sya.id, "3.00"]] }))), "validation", "every change needs a reason");
  assert.equal(kind(await noWrite(() => edit(shared, fall.id, { values: { fingerprint: "stale" } }))), "stale");
  ok(await edit(shared, fall.id, { values: { method: "split", courseId: sessional.id }, teachers: [[syb.id, "1.50"], [sya.id, "1.50"]] }));
  assert.deepEqual((await rowsOf(shared)).allocations, [[sya.id, "1.50", "split", fall.id], [syb.id, "1.50", "split", fall.id]].sort()); assert.equal((await rowsOf(shared)).group.courseId, theory.id, "the course never changes");
  ok(await edit(shared, fall.id, { teachers: [[syb.id, "3.00"]] })); assert.deepEqual((await rowsOf(shared)).allocations, [[syb.id, "3.00", "sole", fall.id]]);
  ok(await edit(shared, fall.id, { teachers: [] })); assert.deepEqual((await rowsOf(shared)).allocations, []); assert.deepEqual((await groupOf(shared)).states, ["vacancy", "provisional"]);
  // Audience of an unused group can change: move one cohort out of the merged class into its own group.
  ok(await edit(merged, fall.id, { offerings: [a.id] })); assert.deepEqual((await rowsOf(merged)).links, [a.id]);
  ok(await edit(shared, fall.id, { offerings: [c.id, b.id] })); assert.deepEqual((await rowsOf(shared)).links, [b.id, c.id].sort((x, y) => x - y));
  assert.equal(kind(await noWrite(() => edit(shared, fall.id, { offerings: [c.id, a.id] }))), "conflict", "joining a cohort already in another group");
  assert.equal(kind(await noWrite(() => edit(shared, fall.id, { offerings: [] }))), "validation"); assert.equal(kind(await noWrite(() => edit(shared, fall.id, { offerings: [c.id, d.id] }))), "validation", "another course's cohort");
  ok(await edit(shared, fall.id, { values: { delivery: "teacher_managed", meetings: undefined, minutes: undefined } })); assert.equal((await rowsOf(shared)).requirements.length, 1);
  ok(await edit(shared, fall.id, { values: { delivery: "fixed", meetings: "3", minutes: "225" } })); assert.deepEqual((await rowsOf(shared)).requirements.map(row => [row.requiredMeetingsPerWeek, row.expectedWeeklyMinutes]), [[3, 225]]);
  assert.equal(kind(await noWrite(() => remove(shared, fall.id, { confirmation: "syn-4101" }))), "validation"); assert.equal(kind(await noWrite(() => remove(shared, fall.id, { reason: "" }))), "validation"); assert.equal(kind(await noWrite(() => remove(shared, fall.id, { fingerprint: "stale" }))), "stale");
  ok(await remove(shared, fall.id)); const gone = await rowsOf(shared); assert.equal(gone.group, undefined); assert.deepEqual([gone.links, gone.requirements, gone.allocations], [[], [], []]);
  assert.ok((await view()).ungrouped.some(row => row.offeringId === c.id) && (await view()).ungrouped.some(row => row.offeringId === b.id), "its offerings are waiting again");
  assert.equal(kind(await noWrite(() => call({ command: "remove", termId: fall.id, groupId: shared, fingerprint: "x", confirmation: theory.code, reason: "Synthetic" }))), "stale", "a removed group is missing");
  lines.push("Unused class group: unchanged saves write nothing and no event; every change needs a reason; stale review is refused; teachers, units, crediting, delivery and requirement change with exactly one requirement row; the course never changes; the audience may change and refuses cohorts held elsewhere or of another course; removal needs the typed code and a reason, deletes only the group's own rows and leaves its offerings waiting again.");

  // AC-06 used groups in the active term (fixture: scheduled, enrolled, attended).
  const active = await view(summer.id), used = active.groups.find(group => group.audiences.length === 2)!, lab = active.groups.find(group => group.course.id === sessional.id)!;
  assert.equal(used.usage.meetings, 1); assert.equal(used.usage.enrollments, 3); assert.equal(used.usage.sessions, 1); assert.deepEqual(used.lockedTeacherIds, [sya.id]); assert.equal(used.schedule, "partial"); assert.equal(lab.schedule, "scheduled"); assert.equal(lab.method, "split");
  const [hscTheory] = await db.select().from(s.courseOfferings).where(and(eq(s.courseOfferings.termId, summer.id), eq(s.courseOfferings.batchId, hsc22b.id), eq(s.courseOfferings.courseId, theory.id)));
  assert.equal(kind(await noWrite(() => edit(used.id, summer.id, { offerings: [hscTheory.id] }))), "conflict", "audience is fixed once used");
  assert.equal(kind(await noWrite(() => remove(used.id, summer.id))), "conflict", "a used group cannot be removed");
  assert.equal(kind(await noWrite(() => edit(used.id, summer.id, { teachers: [[syb.id, "3.00"]] }))), "conflict", "a teacher on a scheduled class cannot be removed");
  assert.equal(kind(await noWrite(() => edit(used.id, summer.id, { values: { delivery: "teacher_managed" } }))), "conflict", "delivery is fixed while classes are scheduled");
  assert.equal(kind(await noWrite(() => edit(used.id, summer.id, { values: { method: "split" }, teachers: [[sya.id, "3.00"], [syc.id, "1.00"]] }))), "validation", "an inactive teacher cannot be added");
  assert.equal(kind(await noWrite(() => call({ command: "update", termId: fall.id, groupId: used.id, fingerprint: used.fingerprint, delivery: "fixed", meetings: "2", minutes: "150", reason: "Synthetic" }, [hscTheory.id]))), "stale", "a class group cannot be addressed through another term");
  ok(await edit(used.id, summer.id, { values: { method: "split" }, teachers: [[sya.id, "2.00"], [syb.id, "1.00"]] }));
  assert.equal(await totalOf(sya.id, summer.id), 300); assert.equal(await totalOf(syb.id, summer.id), 500);
  // A teacher who later becomes inactive keeps an existing allocation; it is not re-validated.
  await db.update(s.teachers).set({ status: "inactive" }).where(eq(s.teachers.id, syb.id));
  ok(await edit(used.id, summer.id, { values: { minutes: "225", meetings: "3" } })); assert.equal((await groupOf(used.id, summer.id)).teachers.find(teacher => teacher.teacherId === syb.id)!.status, "inactive");
  await db.update(s.teachers).set({ status: "active" }).where(eq(s.teachers.id, syb.id));
  // AC-08: a new active-term group joins the existing completeness report like an imported one.
  ok(await create({ courseId: extra.id, minutes: "150", meetings: "2" }, [h.id], [[sya.id, "2.50"]], summer.id));
  const fresh = (await view(summer.id)).groups.find(group => group.course.id === extra.id)!; assert.equal(fresh.schedule, "unscheduled"); assert.deepEqual(fresh.states, ["ready"]);
  const portalData = await portal.getPortalData(), covered = portalData.coverage.find(row => row.teachingGroupId === fresh.id)!;
  assert.deepEqual([covered.courseCode, covered.audience, covered.status, covered.expectedWeeklyMinutes, covered.requiredMeetings, covered.hasTeacherAssignment], ["SYN-4103", "HSC-22B", "unscheduled", 150, 2, true]);
  assert.ok(portalData.allocations.some(row => row.teachingGroupId === fresh.id && row.teacherId === sya.id && row.units === 2.5), "the workload page reads the new allocation");
  ok(await edit(fresh.id, summer.id, { teachers: [] })); assert.equal((await portal.getPortalData()).coverage.find(row => row.teachingGroupId === fresh.id)!.status, "vacancy");
  assert.deepEqual((await view(summer.id)).totals, { groups: 3, merged: 1, vacancy: 1, noRequirement: 0, ungrouped: 0, unscheduled: 0, reconcile: 0 });
  lines.push("Used class groups in the active term: audience change, removal, a delivery change and removing a teacher who teaches a scheduled class are refused as conflicts; adding an inactive teacher is refused; teachers, units and the requirement still change, and term totals follow at once. A group addressed through another term is missing. A newly created active-term group appears in the existing completeness report and workload allocations exactly like an imported one.");

  // Read-only terms, malformed and forged input.
  for (const status of ["completed", "archived"]) {
    await db.update(s.academicTerms).set({ status }).where(eq(s.academicTerms.id, fall.id));
    const readOnly = await view(); assert.equal(readOnly.editable, false); assert.equal(readOnly.canEdit, false); assert.ok(readOnly.groups.length);
    assert.equal(kind(await noWrite(() => create({ courseId: theory.id }, [c.id]))), "conflict"); assert.equal(kind(await noWrite(() => remove(merged, fall.id))), "conflict");
  }
  await db.update(s.academicTerms).set({ status: "draft" }).where(eq(s.academicTerms.id, fall.id));
  assert.equal(await data.getTermClassGroups("2147483000"), null); assert.equal(await data.getTermClassGroups("abc"), null);
  assert.equal(kind(await noWrite(() => create({ courseId: theory.id, termId: 2147483000 }, [c.id]))), "stale");
  for (const forged of [{ command: "delete-all" }, { command: "create", termId: "1e3" }, { command: "create", termId: `${fall.id} or 1=1` }, { command: "update", groupId: "x" }]) assert.equal(kind(await noWrite(() => call({ termId: fall.id, ...forged }))), "validation");
  const repeated = form({ command: "create", termId: fall.id }); repeated.append("termId", String(summer.id)); assert.equal((await noWrite(() => actions.changeClassGroupAction(null, repeated))).ok, false);
  const file = form({ command: "create", termId: fall.id }); file.set("reason", new Blob(["bad"]), "reason.txt"); assert.equal((await noWrite(() => actions.changeClassGroupAction(null, file))).ok, false);
  const uneven = form({ command: "create", termId: fall.id, courseId: theory.id, delivery: "fixed", meetings: "2", minutes: "150" }, [c.id]); uneven.append("teacherId", String(sya.id)); assert.equal(kind(await noWrite(() => actions.changeClassGroupAction(null, uneven))), "validation", "teacher without units");
  ok(await create({ courseId: theory.id, pendingReconciliation: "true", termIdOverride: summer.id, actorUserId: 999, units: undefined }, [c.id])); const plain = (await view()).groups.find(group => group.audiences.some(audience => audience.offeringId === c.id))!;
  assert.equal((await rowsOf(plain.id)).group.pendingReconciliation, false, "unrecognized fields change nothing"); assert.equal((await rowsOf(plain.id)).group.termId, fall.id);
  lines.push("Completed and legacy-status terms are readable and refuse every write; unknown terms are not found; malformed, repeated, file, uneven and unrecognized inputs change nothing beyond the validated command.");

  // AC-10 reconciliation: broken stored records are shown and never edited or repaired.
  const [twice] = await db.insert(s.teachingRequirements).values({ teachingGroupId: plain.id, expectedWeeklyMinutes: 75, requiredMeetingsPerWeek: 1 }).returning();
  let broken = await groupOf(plain.id); assert.ok(broken.states.includes("reconcile")); assert.match(broken.problems.join(" "), /2 weekly requirements/);
  assert.equal(kind(await noWrite(() => edit(plain.id, fall.id, { teachers: [[sya.id, "3.00"]] }))), "conflict"); assert.equal(kind(await noWrite(() => remove(plain.id, fall.id))), "conflict");
  await db.delete(s.teachingRequirements).where(eq(s.teachingRequirements.id, twice.id));
  const doubled = await db.insert(s.workloadAllocations).values([{ teacherId: sya.id, termId: fall.id, teachingGroupId: plain.id, units: "1.00" }, { teacherId: sya.id, termId: fall.id, teachingGroupId: plain.id, units: "1.00" }]).returning();
  broken = await groupOf(plain.id); assert.match(broken.problems.join(" "), /more than one allocation/); assert.equal(kind(await noWrite(() => edit(plain.id, fall.id))), "conflict");
  for (const row of doubled) await db.delete(s.workloadAllocations).where(eq(s.workloadAllocations.id, row.id));
  const [crossed] = await db.insert(s.teachingGroupOfferings).values({ teachingGroupId: plain.id, offeringId: d.id }).returning();
  broken = await groupOf(plain.id); assert.match(broken.problems.join(" "), /different course/); assert.equal(kind(await noWrite(() => edit(plain.id, fall.id))), "conflict");
  const [second] = await db.insert(s.teachingGroupOfferings).values({ teachingGroupId: merged, offeringId: c.id }).returning();
  assert.match((await groupOf(merged)).problems.join(" "), /also in another class group/); assert.equal((await view()).totals.reconcile, 2);
  await db.delete(s.teachingGroupOfferings).where(eq(s.teachingGroupOfferings.id, crossed.id)); await db.delete(s.teachingGroupOfferings).where(eq(s.teachingGroupOfferings.id, second.id));
  assert.equal((await groupOf(plain.id)).problems.length, 0);
  lines.push("Stored records that break the rules (two weekly requirements, duplicate allocations, a link to another course's offering, an offering in two class groups) are reported as needing reconciliation and refuse edits and removal without any write; nothing is repaired automatically.");

  // AC-07 audit atomicity, AC-02/AC-09 preservation, history.
  const faultHandle = { exec: async (q: string) => { if ("exec" in client) await (client as unknown as { exec: (q: string) => Promise<unknown> }).exec(q); else await client.query(q); } };
  await setAuditInsertFault(faultHandle, false);
  const rollbackBefore = await fingerprintDatabase(client);
  await setAuditInsertFault(faultHandle, true);
  assert.equal((await create({ courseId: sessional.id, meetings: "1" }, [d.id], [[sya.id, "2.00"]])).ok, false); assert.equal((await edit(plain.id, fall.id, { teachers: [[sya.id, "3.00"]] })).ok, false); assert.equal((await remove(plain.id, fall.id)).ok, false);
  await setAuditInsertFault(faultHandle, false);
  const rollbackAfter = await fingerprintDatabase(client); for (const [name, value] of Object.entries(rollbackBefore.tables)) assert.deepEqual(rollbackAfter.tables[name], value, name);
  assert.equal((await context.readTermContext()).generation, generation, "class-group changes never advance the term generation");
  const state = (await context.readTermContext()).state; assert.equal(state.kind === "one" && state.term.id, summer.id, "active selection unchanged");
  const final = await fingerprintDatabase(client);
  for (const [name, value] of Object.entries(baseline.tables)) if (!OWN_TABLES.includes(name)) assert.deepEqual(final.tables[name], value, name);
  const history = await data.getClassGroupChanges(fall.id); assert.ok(history.changes.length >= 10); assert.doesNotMatch(JSON.stringify(history), /actorUserId|@example/);
  assert.ok(history.changes.some(event => event.action === "class_group.remove" && event.course === "SYN-4101" && event.reason === "Synthetic removal" && event.before?.audience.join() === "DIP-22B,HSC-22B" && !event.after));
  assert.ok(history.changes.some(event => event.action === "class_group.update" && event.before?.teachers.length === 2 && event.after?.method === "split"));
  assert.ok(history.changes.some(event => event.action === "class_group.create" && event.after?.deliveryMode === "teacher_managed"));
  await assert.rejects(data.getClassGroupChanges(fall.id, (await data.getClassGroupChanges(summer.id)).changes[0].id), /cursor/);
  for (let index = 0; index < 11; index++) { ok(await edit(plain.id, fall.id, { teachers: [[sya.id, "3.00"]] })); ok(await edit(plain.id, fall.id, { teachers: [] })); }
  const page = await data.getClassGroupChanges(fall.id); assert.equal(page.changes.length, 20); assert.ok(page.next); const older = await actions.loadClassGroupChangesAction(fall.id, page.next!); assert.ok(older.changes.length); assert.ok(!older.changes.some(event => page.changes.some(newer => newer.id === event.id)));
  lines.push("Audit failure rolls back create, update and remove entirely. Across every operation only teaching_groups, teaching_group_offerings, teaching_requirements, workload_allocations and audit_events changed: offerings, meetings and their teachers/rooms, enrollments, attendance, extra-load records, schedule versions, placements, courses, teachers, terms and the term generation/active selection are identical. Per-term history is editor-only, paged at 20 with validated cursors, and exposes no actor email or user ID.");

  // AC-08 / AC-11 server rendering of the list page.
  const html = async (termId: number, search: Record<string, string> = {}) => renderToStaticMarkup(await listPage.default({ params: Promise.resolve({ id: String(termId) }), searchParams: Promise.resolve(search) }));
  const editorHtml = await html(fall.id);
  for (const text of ["Class groups — Fall 2026", "Offerings without a class group", "Create class group", "Change history", "viewing it does not change the active term", "This is a draft term", "Teacher-managed — no weekly classes", "No teacher yet", "Vacancy", "EEE-23X · outside audience · count unknown"]) assert.ok(editorHtml.includes(text), text);
  const summerHtml = await html(summer.id);
  for (const text of ["This is the active term.", "Merged class", "cohorts stay separate", "Partially scheduled", "Units split between them", "In the routine: 1 class"]) assert.ok(summerHtml.includes(text), text);
  assert.ok((await html(fall.id, { state: "teacher_managed" })).includes("SYN-4000")); assert.ok(!(await html(fall.id, { state: "teacher_managed" })).includes("Synthetic Theory"));
  assert.ok((await html(fall.id, { q: "zzz-no-match" })).includes("No class group matches these filters."));
  signInAs("class-group-role-5@example.invalid"); const viewerHtml = await html(fall.id);
  assert.ok(viewerHtml.includes("View only")); for (const text of ["Create class group", "Change history", ">Open<"]) assert.ok(!viewerHtml.includes(text), `viewer must not see ${text}`);
  assert.ok(viewerHtml.includes("SYN-4000"), "viewers still read the list");
  signInAs("admin@example.invalid");
  await db.update(s.academicTerms).set({ status: "completed" }).where(eq(s.academicTerms.id, fall.id)); const readOnlyHtml = await html(fall.id); assert.ok(readOnlyHtml.includes("Read-only term")); assert.ok(!readOnlyHtml.includes("Create class group"));
  await db.update(s.academicTerms).set({ status: "draft" }).where(eq(s.academicTerms.id, fall.id));
  const [empty] = await db.insert(s.academicTerms).values({ name: "Spring 2027", academicYear: 2027, startDate: "2027-03-01", endDate: "2027-06-30", status: "draft" }).returning();
  assert.ok((await html(empty.id)).includes("No offerings yet")); await assert.rejects(html(2147483000), /not-found/);
  lines.push("Server-rendered list page: editor sees class groups, states, the ungrouped offerings and actions; the active term shows merged classes, crediting and scheduling status; filters narrow rows; a view-only role reads the list with no create, open or history controls; completed terms render read-only; a term without offerings explains the missing step; an unknown term is not found.");
  report({ lines });
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
