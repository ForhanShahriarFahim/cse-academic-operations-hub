/** Real catalog actions/authorization/loaders with controlled request/session boundaries. */
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { loadApp, report, signInAs } from "./controlled-runtime";
import { fingerprintDatabase, selectFingerprint } from "../fingerprint";
import { setAuditInsertFault } from "../faults";
import type { CourseResult } from "../../../src/lib/course-store";
import { courseDraft } from "../../../src/lib/course-records";
import { renderToStaticMarkup } from "react-dom/server";
const { db } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const actions = loadApp<typeof import("../../../src/lib/course-actions")>("src/lib/course-actions.ts");
const data = loadApp<typeof import("../../../src/lib/course-data")>("src/lib/course-data.ts");
const portal = loadApp<typeof import("../../../src/lib/data")>("src/lib/data.ts");
const routine = loadApp<typeof import("../../../src/lib/actions")>("src/lib/actions.ts");
const academic = loadApp<typeof import("../../../src/lib/academic-actions")>("src/lib/academic-actions.ts");
const rooms = loadApp<typeof import("../../../src/lib/room-transaction")>("src/lib/room-transaction.ts");
const context = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const completeness = loadApp<typeof import("../../../src/components/courses/course-completeness")>("src/components/courses/course-completeness.tsx");
const client = (db as unknown as { $client: import("../database").Queryable }).$client;
const form = (values: Record<string, unknown>) => { const f = new FormData(); for (const [key, value] of Object.entries(values)) f.set(key, String(value)); return f; };
const call = (values: Record<string, unknown>) => actions.saveCourseAction(null, form(values));
const ok = (result: CourseResult) => { assert.equal(result.ok, true, result.message); return result.outcome?.kind === "success" ? result.outcome.entityId! : 0; };
const get = async (id: number) => (await db.select().from(s.courses).where(eq(s.courses.id, id)))[0];
const edit = async (id: number, changes: Record<string, unknown> = {}) => { const row = await get(id); return call({ ...courseDraft(row), command: "save", courseId: id, revision: row.revision, reason: "Synthetic catalog correction", ...changes }); };
const create = (code: string) => call({ ...courseDraft(null), command: "save", code, title: "Synthetic new course", credits: "3", courseType: "theory", semester: "4", owningDepartmentId: "unknown", reason: "" });
async function lifecycle(id: number, command: string, changes: Record<string, unknown> = {}) { const d = (await data.getCourseDetail(String(id)))!; return call({ courseId: id, revision: d.record.revision, command, reason: "Synthetic lifecycle", confirmation: d.record.code, fingerprint: d.fingerprints![command as "deactivate" | "reactivate"], acknowledge: "on", ...changes }); }
const noWrite = async (work: () => Promise<unknown>) => { const before = await fingerprintDatabase(client); const result = await work(); assert.deepEqual(await fingerprintDatabase(client), before); return result; };

async function main() {
  const lines: string[] = []; signInAs("admin@example.invalid");
  const [cse, eee] = await db.select().from(s.departments).orderBy(s.departments.id);
  const [used] = await db.select().from(s.courses).orderBy(s.courses.id);
  assert.equal((await data.getCourseDirectory()).publishedVersion, 1);
  for (const [index, role, departmentId, allowed] of [[0, "academic_administrator", null, true], [1, "academic_administrator", cse.id, true], [2, "academic_administrator", eee.id, false], [3, "routine_coordinator", null, false], [4, "teacher", null, false], [5, "read_only_viewer", null, false], [6, "system_administrator", eee.id, false]] as const) {
    const email = `catalog-role-${index}@example.invalid`;
    const [user] = await db.insert(s.portalUsers).values({ email, displayName: `Synthetic catalog role ${index}`, status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role, departmentId }); signInAs(email);
    const result = await create(`ROLE-${1000 + index}`); assert.equal(result.ok, allowed, result.message);
    if (departmentId === eee.id) await assert.rejects(data.getCourseDetail(String(used.id)));
    else { const detail = (await data.getCourseDetail(String(used.id)))!; assert.equal(detail.editor, allowed); assert.equal(detail.evidence !== null, allowed); }
    if (!allowed) { assert.equal(result.outcome?.kind, "permission"); await assert.rejects(data.getCourseChanges(used.id)); await assert.rejects(data.courseDepartments()); await assert.rejects(data.requireCourseEditor("/courses/new")); }
    else {
      await db.update(s.roleAssignments).set({ activeTo: new Date(0) }).where(eq(s.roleAssignments.userId, user.id));
      assert.equal((await noWrite(() => create("REVOKED-1000")) as CourseResult).outcome?.kind, "permission"); await assert.rejects(data.getCourseChanges(used.id));
    }
  }
  signInAs(null); assert.equal((await noWrite(() => create("ANON-1000")) as CourseResult).outcome?.kind, "permission"); await assert.rejects(data.getCourseDirectory()); await assert.rejects(data.getCourseChanges(used.id)); signInAs("admin@example.invalid");
  lines.push("Real entry-point permission matrix: global/CSE administrators allowed; other-department-only administrator, coordinator, teacher, viewer, revoked and anonymous denied. Non-editor detail omits impact/history; direct history/editor loads refused.");
  const id = ok(await create(" cse 4000(a) ")); assert.equal((await get(id)).code, "CSE-4000(A)"); assert.equal((await get(id)).semester, 4);
  ok(await create("CSE-4000(B)"));
  const repeated = form({ command: "save", ...courseDraft(null) }); repeated.append("code", "CSE-1111"); assert.equal((await noWrite(() => actions.saveCourseAction(null, repeated)) as CourseResult).ok, false);
  const file = form({ command: "save" }); file.set("title", new Blob(["bad"]), "title.txt"); assert.equal((await noWrite(() => actions.saveCourseAction(null, file)) as CourseResult).ok, false);
  assert.equal((await noWrite(() => create("CSE-4000(A)")) as CourseResult).ok, false);
  assert.equal((await noWrite(() => edit(used.id, { credits: "4.0" })) as CourseResult).ok, false);
  // Malformed fixture snapshots independently protect even unused definitions.
  assert.equal((await noWrite(() => edit(id, { credits: "4.0" })) as CourseResult).ok, false);
  assert.equal((await noWrite(() => lifecycle(id, "deactivate")) as CourseResult).ok, false);
  const versions = await db.select().from(s.scheduleVersions);
  const immutableBefore = await selectFingerprint(client, "select * from schedule_versions");
  const beforeUse = await fingerprintDatabase(client);
  const review = await edit(used.id, { title: "Corrected live title" }); assert.ok(review.fingerprint); assert.equal(review.ok, false);
  const token = review.fingerprint;
  const [newOffer] = await db.insert(s.courseOfferings).values({ courseId: used.id, batchId: (await db.select().from(s.batches)).at(-1)!.id, termId: versions[0].termId, status: "cancelled" }).returning();
  const refreshed = await edit(used.id, { title: "Corrected live title", acknowledge: "on", fingerprint: token }); assert.equal(refreshed.ok, false); assert.notEqual(refreshed.fingerprint, token);
  await db.delete(s.courseOfferings).where(eq(s.courseOfferings.id, newOffer.id));
  const confirmed = await edit(used.id, { title: "Corrected live title", acknowledge: "on", fingerprint: token }); ok(confirmed);
  const afterUse = await fingerprintDatabase(client);
  for (const [name, fp] of Object.entries(beforeUse.tables)) if (!["public.courses", "public.audit_events"].includes(name)) assert.deepEqual(afterUse.tables[name], fp, name);
  assert.deepEqual(await selectFingerprint(client, "select * from schedule_versions"), immutableBefore);
  assert.ok((await portal.getPortalData()).meetings.some(meeting => meeting.courseTitle === "Corrected live title"));
  const stale = await call({ command: "save", courseId: used.id, revision: 1, ...courseDraft(used), reason: "Stale" }); assert.equal(stale.outcome?.kind, "stale");
  await noWrite(() => edit(used.id));
  lines.push("Used academic edits and unsupported snapshots refused; title acknowledgement bound to fresh evidence; changed references force review again. Live labels update while all unrelated rows, attendance, allocation units, claim labels and saved snapshot bytes stay identical. Stale/no-op/malformed fields do not write.");
  // Use supported snapshots for independent identity, lifecycle and metadata-only probes.
  await db.update(s.scheduleVersions).set({ snapshot: { generatedAt: "2026-01-01T00:00:00Z", termName: "Synthetic", versionNumber: 1, meetings: [] } });
  ok(await edit(id, { code: "CSE-4999", semester: "5", credits: "2.0" }));
  assert.equal((await create("CSE-4000(A)")).ok, false, "historical alias reserved"); ok(await edit(id, { code: "CSE-4000(A)" }));
  // New/renamed normalized collisions refused, retained duplicates remain independently correctable.
  await db.insert(s.courses).values({ code: " cse-4000(a) ", title: "Legacy duplicate", credits: "0.0", courseType: "legacy", semester: 99 });
  ok(await edit(id, { title: "Duplicate canonical identity retained" }));
  const [legacy] = await db.select().from(s.courses).where(eq(s.courses.code, " cse-4000(a) ")); ok(await edit(legacy.id, { title: "Legacy title correction" })); assert.equal((await get(legacy.id)).credits, "0.0");
  ok(await lifecycle(id, "deactivate")); assert.equal((await get(id)).isActive, false); ok(await lifecycle(id, "reactivate")); await noWrite(() => lifecycle(id, "reactivate"));
  const term = (await context.captureActiveContext()).term;
  assert.match(renderToStaticMarkup(await completeness.CourseCompleteness({ expectedTermId: 2147483647 })), /active term changed/);
  const [completed] = await db.insert(s.academicTerms).values({ name: "Catalog completed", academicYear: 2025, startDate: "2025-01-01", endDate: "2025-05-01", status: "completed" }).returning();
  const batch = (await db.select().from(s.batches))[0];
  const life = ok(await create("LIFE-1000"));
  const [offering] = await db.insert(s.courseOfferings).values({ courseId: life, batchId: batch.id, termId: term.id, status: "cancelled" }).returning();
  ok(await lifecycle(life, "deactivate")); ok(await lifecycle(life, "reactivate"));
  await db.update(s.courseOfferings).set({ status: "mystery", termId: completed.id }).where(eq(s.courseOfferings.id, offering.id)); assert.equal((await lifecycle(life, "deactivate")).ok, false);
  await db.update(s.courseOfferings).set({ status: "completed" }).where(eq(s.courseOfferings.id, offering.id));
  const [group] = await db.insert(s.teachingGroups).values({ courseId: life, termId: term.id, deliveryMode: "teacher_managed" }).returning();
  assert.equal((await lifecycle(life, "deactivate")).ok, false, "unscheduled teacher-managed group blocks");
  await db.update(s.teachingGroups).set({ termId: completed.id }).where(eq(s.teachingGroups.id, group.id));
  ok(await lifecycle(life, "deactivate"));
  assert.equal((await portal.getPortalData()).courses.find(course => course.id === life)!.isActive, false);
  const [room] = await db.select().from(s.rooms); await assert.rejects(db.transaction(tx => rooms.validateRoomAssignment(tx, group.id, [room.id])), /course is inactive/i);
  await db.update(s.teachingGroups).set({ termId: term.id }).where(eq(s.teachingGroups.id, group.id));
  const t = await context.captureActiveContext();
  const formToken = { _activeTermId: t.term.id, _termGeneration: t.writeContext.generation };
  assert.equal((await routine.createMeetingAction(form({ ...formToken, teachingGroupId: group.id, dayOfWeek: 0, startTime: "14:00", endTime: "15:00", roomIds: room.id, teacherIds: (await db.select().from(s.teachers))[0].id }))).ok, false);
  await db.update(s.teachingGroups).set({ deliveryMode: "fixed", externalAudienceLabel: "Synthetic external", externalStudentCount: 10 }).where(eq(s.teachingGroups.id, group.id));
  await db.insert(s.teachingRequirements).values({ teachingGroupId: group.id, expectedWeeklyMinutes: 75, requiredMeetingsPerWeek: 1 });
  await db.insert(s.workloadAllocations).values({ teachingGroupId: group.id, termId: term.id, teacherId: (await db.select().from(s.teachers))[0].id, units: "3.00" });
  assert.equal((await academic.applyAutoScheduleAction(t.writeContext)).ok, false);
  lines.push("Normalized collisions/aliases and legacy values preserved. Explicit lifecycle retains completed/cancelled history; unknown statuses and unscheduled/teacher-managed groups block. Inactive course stays serialized; authoritative assignment seam/manual/automatic action refuse it.");
  const snapOnly = ok(await create("SNAP-1000"));
  const metadata = { schemaVersion: 3, generatedAt: "2026-01-01T00:00:00Z", versionNumber: 1, term: { id: term.id }, meetings: [], batches: [], breaks: [], issues: [], externalCommitments: [], metadata: { courses: [{ code: "SNAP-1000" }] } };
  await db.update(s.scheduleVersions).set({ snapshot: metadata }).where(eq(s.scheduleVersions.id, versions[0].id)); assert.equal((await edit(snapOnly, { credits: "5" })).ok, false); ok(await lifecycle(snapOnly, "deactivate"));
  await db.update(s.academicTerms).set({ status: "completed" }).where(eq(s.academicTerms.id, term.id)); assert.equal((await data.getCourseDirectory()).term, null); assert.ok(await data.getCourseDetail(String(id)));
  assert.match(renderToStaticMarkup(await completeness.CourseCompleteness({ expectedTermId: term.id })), /global catalog remains available/);
  await db.update(s.academicTerms).set({ status: "active" }).where(eq(s.academicTerms.id, term.id));
  await db.execute(sql`drop index academic_terms_one_active_uq`); await db.update(s.academicTerms).set({ status: "active" }).where(eq(s.academicTerms.id, completed.id)); assert.equal((await data.getCourseDirectory()).term, null);
  await db.update(s.academicTerms).set({ status: "completed" }).where(eq(s.academicTerms.id, completed.id)); await db.execute(sql`create unique index academic_terms_one_active_uq on academic_terms(status) where status = 'active'`);
  for (const version of versions) await db.update(s.scheduleVersions).set({ snapshot: version.snapshot }).where(eq(s.scheduleVersions.id, version.id));
  const faultHandle = { exec: async (q: string) => { if ("exec" in client) await (client as unknown as { exec: (q: string) => Promise<unknown> }).exec(q); else await client.query(q); } };
  const rollbackBefore = await fingerprintDatabase(client);
  await setAuditInsertFault(faultHandle, true);
  const rollbackReview = await edit(id, { title: "Must roll back" });
  assert.equal((await edit(id, { title: "Must roll back", fingerprint: rollbackReview.fingerprint, acknowledge: "on" })).ok, false);
  await setAuditInsertFault(faultHandle, false);
  const rollbackAfter = await fingerprintDatabase(client); for (const [name, fp] of Object.entries(rollbackBefore.tables)) assert.deepEqual(rollbackAfter.tables[name], fp, name);
  const first = await data.getCourseChanges(id); assert.ok(first.changes.length); assert.doesNotMatch(JSON.stringify(first), /actorUserId|@example/);
  await assert.rejects(data.getCourseChanges(id, (await data.getCourseChanges(used.id)).changes[0].id));
  for (let index = 0; index < 22; index++) { const review = await edit(id, { title: `Paged title ${index}` }); ok(await edit(id, { title: `Paged title ${index}`, acknowledge: "on", fingerprint: review.fingerprint })); }
  const page = await data.getCourseChanges(id); assert.equal(page.changes.length, 20); assert.ok(page.next); const older = await data.getCourseChanges(id, page.next!); assert.ok(older.changes.length); assert.ok(!older.changes.some(event => page.changes.some(old => old.id === event.id)));
  lines.push("Metadata-only snapshots freeze academic fields without creating teaching obligations; zero/ambiguous active contexts retain global access; audit failure rolls back all domain/audit writes; history has validated per-course cursors, 20-event pages and no actor email/private identity fields.");
  report({ lines });
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
