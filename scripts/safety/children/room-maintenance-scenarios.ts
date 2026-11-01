import { freshTermActions } from "./fresh-term-actions";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type * as Db from "../../../src/db";
import type * as Schema from "../../../src/db/schema";
import type * as MaintenanceActions from "../../../src/lib/room-maintenance-actions";
import type * as MaintenanceData from "../../../src/lib/room-maintenance-data";
import type * as RoomActions from "../../../src/lib/room-actions";
import type * as Actions from "../../../src/lib/actions";
import type * as Auto from "../../../src/lib/academic-actions";
import type * as AutoPlan from "../../../src/lib/schedule-automation";
import type * as Grid from "../../../src/lib/time-grid-actions";
import type * as Data from "../../../src/lib/data";
import type { ActionResult } from "../../../src/lib/action-result";
import type { MaintenanceResult } from "../../../src/lib/room-maintenance-transaction";
const { db } = loadApp<typeof Db>("src/db/index.ts"), s = loadApp<typeof Schema>("src/db/schema.ts");
const { saveMaintenanceAction: save } = loadApp<typeof MaintenanceActions>("src/lib/room-maintenance-actions.ts");
const { getRoomMaintenance } = loadApp<typeof MaintenanceData>("src/lib/room-maintenance-data.ts");
const { lifecycleRoomAction } = loadApp<typeof RoomActions>("src/lib/room-actions.ts");
const actions = freshTermActions(loadApp<typeof Actions>("src/lib/actions.ts")), auto = freshTermActions(loadApp<typeof Auto>("src/lib/academic-actions.ts")), grid = freshTermActions(loadApp<typeof Grid>("src/lib/time-grid-actions.ts"));
const { buildAutoSchedulePlan } = loadApp<typeof AutoPlan>("src/lib/schedule-automation.ts");
const { getPortalData } = loadApp<typeof Data>("src/lib/data.ts");
const form = (values: Record<string, unknown>) => { const fd = new FormData(); for (const [key, value] of Object.entries(values)) for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v instanceof File ? v : String(v)); return fd; };
const base = { action: "create", entryId: "", startDate: "2026-06-13", endDate: "2026-06-13", weekdays: ["0"], startMinutes: "540", endMinutes: "600", reason: "Synthetic maintenance" };
const currentRoom = async (id: number) => (await db.select().from(s.rooms).where(eq(s.rooms.id, id)))[0];
async function command(roomId: number, patch: Record<string, unknown> = {}): Promise<Record<string, unknown>> { return { ...base, roomId: String(roomId), revision: String((await currentRoom(roomId)).revision), ...patch }; }
async function confirm(raw: Record<string, unknown>) { const result = await save(null, form(raw)); return result.fingerprint ? save(null, form({ ...raw, fingerprint: result.fingerprint, acknowledge: "on" })) : result; }
let serial = 0;
async function room() { return (await db.insert(s.rooms).values({ code: `ACT-C-${++serial}`, building: "Synthetic", roomType: "lab", capabilities: ["computer", "theory"], capacity: 100 }).returning())[0]; }
async function main() {
  await db.update(s.academicTerms).set({ status: "completed" });
  await db.update(s.academicTerms).set({ status: "active" }).where(eq(s.academicTerms.name, "Summer 2026"));
  const lines: string[] = [], [cse, eee] = await db.select().from(s.departments).orderBy(s.departments.id), sample = await room();
  const cases = [["system_administrator", null, true], ["academic_administrator", cse.id, true], ["routine_coordinator", cse.id, true], ["academic_administrator", eee.id, false], ["routine_coordinator", eee.id, false], ["teacher", cse.id, false], ["read_only_viewer", null, false], ["department_approver", null, false], ["accounts_officer", null, false]] as const;
  for (const [i, [role, departmentId, allowed]] of cases.entries()) {
    const email = `maint-role-${i}@example.invalid`, [user] = await db.insert(s.portalUsers).values({ email, displayName: "Synthetic maintenance actor", status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role, departmentId }); signInAs(email);
    const result = await save(null, form(await command(sample.id, { startDate: "2099-01-03", endDate: "2099-01-03", weekdays: ["0", "1", "2", "3", "4", "5", "6"] })));
    assert.equal(result.ok, allowed, `${role}: ${result.message}`);
    if (allowed || role === "teacher" || role === "read_only_viewer") assert.ok(await getRoomMaintenance(sample.id));
    await db.update(s.roleAssignments).set({ activeFrom: new Date("2099-01-01") }).where(eq(s.roleAssignments.userId, user.id)); assert.equal((await save(null, form(await command(sample.id)))).outcome?.kind, "permission");
    await db.update(s.roleAssignments).set({ activeFrom: new Date(0), activeTo: new Date(1) }).where(eq(s.roleAssignments.userId, user.id)); assert.equal((await save(null, form(await command(sample.id)))).outcome?.kind, "permission");
  }
  signInAs(null); assert.equal((await save(null, form(await command(sample.id)))).outcome?.kind, "permission"); await assert.rejects(getRoomMaintenance(sample.id), /Sign in/);
  signInAs("admin@example.invalid");
  const raw = await command(sample.id);
  for (const key of Object.keys(raw)) if (key !== "weekdays") {
    const fd = form(raw); fd.append(key, "duplicate"); assert.equal((await save(null, fd)).outcome?.kind, "validation");
    fd.delete(key); fd.append(key, new File(["x"], "x")); assert.equal((await save(null, fd)).outcome?.kind, "validation");
  }
  const fd = form(raw); fd.append("weekdays", new File(["x"], "x")); assert.equal((await save(null, fd)).outcome?.kind, "validation");
  // Keep historical publications intact; clear unrelated fixture blockers by cancelling draft classes only.
  await db.update(s.meetings).set({ status: "cancelled" });
  await db.update(s.teachingGroups).set({ deliveryMode: "teacher_managed" });
  const [term] = await db.select().from(s.academicTerms).where(eq(s.academicTerms.status, "active")), [course] = await db.select().from(s.courses).where(eq(s.courses.courseType, "theory")), [teacher] = await db.select().from(s.teachers).where(eq(s.teachers.shortCode, "SYA"));
  const makeGroup = async () => (await db.insert(s.teachingGroups).values({ termId: term.id, courseId: course.id, externalAudienceLabel: "Synthetic audience", externalStudentCount: 20 }).returning())[0];
  const r = await room(), g = await makeGroup();
  const create = () => actions.createMeetingAction(form({ teachingGroupId: g.id, dayOfWeek: 0, startTime: "09:00", endTime: "10:00", teacherIds: [teacher.id], roomIds: [r.id], isException: "on", exceptionNote: "Synthetic approved exception" }));
  assert.ok((await create()).ok);
  const [meeting] = await db.select().from(s.meetings).where(eq(s.meetings.teachingGroupId, g.id));
  await db.update(s.meetingRooms).set({ roomRole: "alternative" }).where(eq(s.meetingRooms.meetingId, meeting.id));
  const outside = (await db.insert(s.academicTerms).values({ name: "Synthetic other term C", academicYear: 2027, startDate: "2027-01-01", endDate: "2027-12-31", status: "draft" }).returning())[0];
  const [unresolved] = await db.insert(s.externalCommitments).values({ termId: term.id, kind: "unresolved_note", roomId: r.id, counterpartDepartment: "Synthetic uncertain" }).returning();
  await db.insert(s.externalCommitments).values([{ termId: term.id, kind: "room_reservation", roomId: r.id, counterpartDepartment: "Synthetic pending", dayOfWeek: 0, startMinutes: 560, endMinutes: 620 }, { termId: outside.id, kind: "room_reservation", roomId: r.id, counterpartDepartment: "Unrelated term", dayOfWeek: 0, startMinutes: 540, endMinutes: 600 }, { termId: term.id, kind: "teaching", roomId: r.id, counterpartDepartment: "Metadata only" }]);
  const input = await command(r.id), review = await save(null, form(input)); assert.equal(review.ok, false); assert.ok(review.fingerprint); assert.equal(review.impact!.totals.meeting, 1); assert.equal(review.impact!.totals.physicalOD, 1); assert.equal(review.impact!.totals.uncertainOD, 1);
  await db.update(s.externalCommitments).set({ dayOfWeek: 1 }).where(eq(s.externalCommitments.id, unresolved.id));
  const fresh = await save(null, form({ ...input, fingerprint: review.fingerprint, acknowledge: "on" })); assert.equal(fresh.ok, false); assert.notEqual(fresh.fingerprint, review.fingerprint);
  const snapshots = JSON.stringify(await db.select().from(s.scheduleVersions));
  assert.ok((await save(null, form({ ...input, fingerprint: fresh.fingerprint, acknowledge: "on" }))).ok);
  assert.equal(JSON.stringify(await db.select().from(s.scheduleVersions)), snapshots);
  const [entry] = await db.select().from(s.roomUnavailability).where(eq(s.roomUnavailability.roomId, r.id));
  assert.equal((await actions.moveMeetingAction(meeting.id, 0, 540, 600)).ok, false);
  assert.equal((await actions.updateMeetingAction(meeting.id, { ...meeting, teacherIds: [teacher.id], roomIds: [r.id], isException: true, exceptionNote: "Cannot bypass maintenance" })).ok, false);
  assert.equal((await actions.createExternalAction(form({ kind: "room_reservation", counterpartDepartment: "Synthetic new", roomId: r.id, dayOfWeek: 0, startTime: "09:00", endTime: "10:00" }))).outcome?.kind, "conflict");
  assert.ok((await actions.createExternalAction(form({ kind: "unresolved_note", counterpartDepartment: "Unknown use can be recorded", roomId: r.id }))).ok);
  await db.update(s.meetings).set({ status: "cancelled" }).where(eq(s.meetings.id, meeting.id));
  const blockedPublication = await actions.publishAction("Synthetic uncertainty gate"); assert.equal(blockedPublication.ok, false); assert.match(JSON.stringify(blockedPublication), /maintenance|Unverified room use/i);
  assert.ok((await save(null, form(await command(r.id, { action: "cancel", entryId: String(entry.id), entryRevision: "1", correctionReason: "Outage ended", confirmCancellation: "on" })))).ok);
  assert.ok((await actions.publishAction("Synthetic after cancellation")).ok);
  assert.ok((await getPortalData()).maintenance);
  assert.equal((await lifecycleRoomAction(null, form({ roomId: r.id, revision: (await currentRoom(r.id)).revision, action: "delete", confirmation: r.code, reason: "History test" }))).ok, false);
  lines.push("Production actions: complete role/read/anonymous/expired/future authority matrix; duplicate/File fields; fresh all-term canonical/OD impact and changed uncertainty reconfirmation; exception/move/update/OD refusals; unknown-use recording and conservative publication gate; cancelled history and immutable snapshots.");
  if (process.env.SAFE01_PG_TARGET) await races(lines, term.id, course.id, teacher.id);
  report({ lines });
}

async function races(lines: string[], termId: number, courseId: number, teacherId: number) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 }), control = await pool.connect();
  await pool.query(`create table safe01_maint_barrier(action text); create function safe01_maint_pause() returns trigger language plpgsql as $$ begin if exists(select 1 from safe01_maint_barrier where action = NEW.action) then perform set_config('application_name', 'rom01c-first-action', true); perform pg_advisory_xact_lock(741003); end if; return NEW; end $$; create trigger safe01_maint_pause before insert on audit_events for each row execute function safe01_maint_pause();`);
  async function waitFor(first: boolean) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const result = await pool.query(first ? "select count(*) as n from pg_stat_activity where application_name = 'rom01c-first-action' and wait_event = 'advisory'" : "select count(*) as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and application_name <> 'rom01c-first-action'");
      if (Number(result.rows[0].n)) return; await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`ROM-01C actual action did not reach ${first ? "audit" : "room lock"} barrier`);
  }
  async function overlap(event: string, first: () => Promise<ActionResult>, second: () => Promise<ActionResult>) {
    await pool.query("delete from safe01_maint_barrier"); await pool.query("insert into safe01_maint_barrier values ($1)", [event]); await control.query("select pg_advisory_lock(741003)");
    const one = first().then((value) => ({ value }), (error: unknown) => ({ error })); let two: typeof one | undefined;
    try { await waitFor(true); two = second().then((value) => ({ value }), (error: unknown) => ({ error })); await waitFor(false); } finally { await control.query("select pg_advisory_unlock(741003)"); }
    const a = await one, b = await two!; if ("error" in a) throw a.error; if ("error" in b) throw b.error; return [a.value, b.value];
  }
  try {
    // Clean only synthetic working contexts, preserving snapshots and historical business rows.
    await db.update(s.meetings).set({ status: "cancelled" });
    await db.update(s.teachingGroups).set({ deliveryMode: "teacher_managed" });
    for (const writer of ["create", "update", "move", "od", "auto", "bulk"] as const) for (const mutation of ["create", "edit", "cancel"] as const) for (const maintenanceFirst of [true, false]) {
      console.error(`ROM-01C race ${writer}/${mutation}/maintenanceFirst=${maintenanceFirst}`);
      await db.update(s.rooms).set({ isActive: false }); const r = await room();
      const [group] = await db.insert(s.teachingGroups).values({ termId, courseId, externalAudienceLabel: "Synthetic race audience", externalStudentCount: 20 }).returning();
      const allDays = ["0", "1", "2", "3", "4", "5", "6"];
      let m: typeof s.meetings.$inferSelect | undefined;
      if (["update", "move", "bulk"].includes(writer)) {
        [m] = await db.insert(s.meetings).values({ teachingGroupId: group.id, dayOfWeek: 0, startMinutes: 540, endMinutes: 600 }).returning();
        await db.insert(s.meetingRooms).values({ meetingId: m.id, roomId: r.id, roomRole: "segment" });
        await db.insert(s.meetingTeachers).values({ meetingId: m.id, teacherId });
      }
      let existing: typeof s.roomUnavailability.$inferSelect | undefined;
      if (mutation !== "create") {
        assert.ok((await confirm(await command(r.id, { startDate: "2027-01-01", endDate: "2027-01-01", weekdays: allDays }))).ok);
        [existing] = await db.select().from(s.roomUnavailability).where(eq(s.roomUnavailability.roomId, r.id));
      }
      let pattern: typeof s.periodPatterns.$inferSelect | undefined;
      if (writer === "bulk") {
        const [offering] = await db.select({ id: s.courseOfferings.id }).from(s.courseOfferings).innerJoin(s.batches, eq(s.batches.id, s.courseOfferings.batchId)).where(eq(s.courseOfferings.termId, termId));
        await db.insert(s.teachingGroupOfferings).values({ teachingGroupId: group.id, offeringId: offering.id });
        const [plan] = (await db.select().from(s.dayPlans).where(eq(s.dayPlans.termId, termId))).filter((p) => p.stream === "HSC" && p.batchId == null && p.dayOfWeek === 0 && p.patternId != null);
        [pattern] = await db.select().from(s.periodPatterns).where(eq(s.periodPatterns.id, plan.patternId!));
        await db.update(s.meetings).set({ startMinutes: pattern.periods[0].start, endMinutes: pattern.periods[0].end }).where(eq(s.meetings.id, m!.id));
      }
      if (writer === "auto") { await db.insert(s.teachingRequirements).values({ teachingGroupId: group.id, expectedWeeklyMinutes: 60, requiredMeetingsPerWeek: 1 }); await db.insert(s.workloadAllocations).values({ termId, teachingGroupId: group.id, teacherId, units: "1" }); assert.ok((await buildAutoSchedulePlan()).plan.suggestions.length); }
      const initial = await command(r.id, { action: mutation, ...(existing ? { entryId: String(existing.id), entryRevision: String(existing.revision), correctionReason: "Race correction" } : {}), startDate: mutation === "cancel" ? "2027-01-01" : "2026-06-01", endDate: mutation === "cancel" ? "2027-01-01" : "2026-09-30", weekdays: allDays, startMinutes: "0", endMinutes: "1440", confirmCancellation: "on" });
      const review: MaintenanceResult = mutation === "cancel" ? { ok: false, message: "Cancellation has explicit confirmation" } : await save(null, form({ ...initial, revision: "999999" }));
      assert.equal(review.ok, false);
      // Obtain a preview without changing data: occupied fixtures return impact; clear fixtures need no token.
      let moveInput = { ...initial };
      if (m && mutation !== "cancel") {
        const p = await save(null, form(initial)); assert.ok(p.fingerprint, p.message); moveInput = { ...initial, fingerprint: p.fingerprint, acknowledge: "on" };
      }
      const change = () => save(null, form(moveInput));
      const assignment = () => writer === "create" ? actions.createMeetingAction(form({ teachingGroupId: group.id, dayOfWeek: 0, startTime: "09:00", endTime: "10:00", teacherIds: [teacherId], roomIds: [r.id] }))
        : writer === "update" ? actions.updateMeetingAction(m!.id, { dayOfWeek: 0, startMinutes: 550, endMinutes: 610, teacherIds: [teacherId], roomIds: [r.id], isException: false, exceptionNote: null })
        : writer === "move" ? actions.moveMeetingAction(m!.id, 0, 550, 610)
        : writer === "od" ? actions.createExternalAction(form({ kind: "combined", counterpartDepartment: "Synthetic race OD", teacherId, roomId: r.id, dayOfWeek: 0, startTime: "09:00", endTime: "10:00" }))
        : writer === "auto" ? auto.applyAutoScheduleAction()
        : grid.savePatternAction({ patternId: pattern!.id, expectedUpdatedAt: pattern!.updatedAt.toISOString(), name: pattern!.name, periods: pattern!.periods.map((p, i) => i === 0 ? { start: p.start + 1, end: p.end } : p), breaks: [], updateHours: true, moveClasses: true });
      const assignmentEvent = { create: "meeting.create", update: "meeting.update", move: "meeting.move", od: "external.create", auto: "meeting.auto_create", bulk: "time_grid.pattern.save" }[writer];
      const beforeGrid = JSON.stringify(await db.select().from(s.periodPatterns)), beforeHours = JSON.stringify(await db.select().from(s.permittedWindows));
      const beforeMeetings = JSON.stringify(await db.select().from(s.meetings).where(eq(s.meetings.teachingGroupId, group.id)));
      const result = await overlap(maintenanceFirst ? `room.maintenance.${mutation}` : assignmentEvent, maintenanceFirst ? change : assignment, maintenanceFirst ? assignment : change);
      assert.ok(result[0].ok, `${writer}/${mutation}/${maintenanceFirst}: ${result[0].message}`);
      if (maintenanceFirst && mutation !== "cancel") assert.equal(result[1].ok, false, `${writer} must reject committed maintenance`);
      if (maintenanceFirst && mutation !== "cancel") {
        assert.equal(JSON.stringify(await db.select().from(s.meetings).where(eq(s.meetings.teachingGroupId, group.id))), beforeMeetings, "rejected placement/batch leaves class rows unchanged");
        assert.equal(JSON.stringify(await db.select().from(s.periodPatterns)), beforeGrid, "rejected bulk leaves grid unchanged");
        assert.equal(JSON.stringify(await db.select().from(s.permittedWindows)), beforeHours, "rejected bulk leaves windows unchanged");
      }
      if (!maintenanceFirst && mutation !== "cancel") { assert.equal(result[1].ok, false, `${writer} changed evidence requires review`); assert.ok((result[1] as MaintenanceResult).fingerprint); }
      if (mutation === "cancel") assert.ok(result[1].ok, result[1].message);
      await db.update(s.meetings).set({ status: "cancelled" }).where(eq(s.meetings.teachingGroupId, group.id)); await db.update(s.teachingGroups).set({ deliveryMode: "teacher_managed" }).where(eq(s.teachingGroups.id, group.id));
      await db.delete(s.externalCommitments).where(eq(s.externalCommitments.roomId, r.id));
    }
    lines.push("Real PostgreSQL production-action barriers: manual create/update/move (undo seam), complete OD, automatic batch and bulk time-grid writers versus maintenance create/edit/cancel in both commit orders; fresh impact confirmation/closure refusal and cancellation ordering.");
    for (const mutation of ["create", "edit", "cancel"] as const) for (const maintenanceFirst of [true, false]) {
      const r = await room(), [group] = await db.insert(s.teachingGroups).values({ termId, courseId, externalAudienceLabel: "Synthetic publication race", externalStudentCount: 20 }).returning();
      const [meeting] = await db.insert(s.meetings).values({ teachingGroupId: group.id, dayOfWeek: 0, startMinutes: 540, endMinutes: 600 }).returning();
      await db.insert(s.meetingRooms).values({ meetingId: meeting.id, roomId: r.id }); await db.insert(s.meetingTeachers).values({ meetingId: meeting.id, teacherId });
      let entry: typeof s.roomUnavailability.$inferSelect | undefined;
      if (mutation !== "create") { assert.ok((await confirm(await command(r.id, { startDate: "2027-01-01", endDate: "2027-01-01", weekdays: ["0", "1", "2", "3", "4", "5", "6"] }))).ok); [entry] = await db.select().from(s.roomUnavailability).where(eq(s.roomUnavailability.roomId, r.id)); }
      const input = await command(r.id, { action: mutation, ...(entry ? { entryId: String(entry.id), entryRevision: String(entry.revision), correctionReason: "Publication race" } : {}), confirmCancellation: "on" });
      let acknowledged = input;
      if (mutation !== "cancel") { const review = await save(null, form(input)); assert.ok(review.fingerprint); acknowledged = { ...input, fingerprint: review.fingerprint, acknowledge: "on" }; }
      const change = () => save(null, form(acknowledged)), publish = () => actions.publishAction("Synthetic maintenance ordering");
      const priorVersions = JSON.stringify(await db.select().from(s.scheduleVersions));
      const result = await overlap(maintenanceFirst ? `room.maintenance.${mutation}` : "publish", maintenanceFirst ? change : publish, maintenanceFirst ? publish : change);
      assert.ok(result[0].ok, `${mutation}/publication/${maintenanceFirst}: ${result[0].message}`);
      if (mutation === "cancel") assert.ok(result[1].ok, result[1].message);
      else if (maintenanceFirst) { assert.equal(result[1].ok, false, "publication must refuse committed outage"); assert.equal(JSON.stringify(await db.select().from(s.scheduleVersions)), priorVersions, "refused publication leaves frozen bytes/states untouched"); }
      else { assert.equal(result[1].ok, false, "new publication requires fresh impact review"); assert.ok((result[1] as MaintenanceResult).impact!.totals.publication > 0); }
      await db.update(s.meetings).set({ status: "cancelled" }).where(eq(s.meetings.id, meeting.id));
    }
    for (const maintenanceFirst of [true, false]) {
      const [r] = await db.insert(s.rooms).values({ code: `DRAFT-C-${++serial}`, building: "Synthetic", isDraft: true }).returning();
      const input = await command(r.id), deletion = { roomId: r.id, revision: r.revision, action: "delete", reason: "Synthetic race", confirmation: r.code };
      const create = () => save(null, form(input)), remove = () => lifecycleRoomAction(null, form(deletion));
      const result = await overlap(maintenanceFirst ? "room.maintenance.create" : "room.delete", maintenanceFirst ? create : remove, maintenanceFirst ? remove : create);
      assert.ok(result[0].ok, result[0].message); assert.equal(result[1].ok, false);
    }
    lines.push("Real PostgreSQL production publication/create/edit/cancel and draft-delete/first-maintenance barriers in both commit orders: committed outages refuse publication, newly published references force fresh confirmation, cancellation serializes, and retained history survives deletion races. Refused publication preserves exact prior versions.");
  } finally { await pool.query("drop trigger if exists safe01_maint_pause on audit_events; drop function if exists safe01_maint_pause(); drop table if exists safe01_maint_barrier"); control.release(); await pool.end(); }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
