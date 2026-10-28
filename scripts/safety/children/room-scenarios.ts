/** Real room actions/guards/loaders on a pinned synthetic target. */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { loadApp, report, signInAs, RedirectSignal } from "./controlled-runtime";
import type * as Db from "../../../src/db";
import type * as Schema from "../../../src/db/schema";
import type * as Actions from "../../../src/lib/room-actions";
import type * as RoomData from "../../../src/lib/room-data";
import type * as Auth from "../../../src/lib/auth";
import type * as PortalData from "../../../src/lib/data";
import type { RoomRecord } from "../../../src/lib/room-records";
import { Pool } from "pg";
import type * as MeetingActions from "../../../src/lib/actions";
import type * as AcademicActions from "../../../src/lib/academic-actions";
import type * as Automation from "../../../src/lib/schedule-automation";
import type { ActionResult } from "../../../src/lib/action-result";
const { db } = loadApp<typeof Db>("src/db/index.ts");
const s = loadApp<typeof Schema>("src/db/schema.ts");
const { saveRoomAction, loadRoomChangesAction } = loadApp<typeof Actions>("src/lib/room-actions.ts");
const { getRoomChanges, requireRoomEditor } = loadApp<typeof RoomData>("src/lib/room-data.ts");
const { can, getOptionalActor } = loadApp<typeof Auth>("src/lib/auth/index.ts");
const { getPortalData } = loadApp<typeof PortalData>("src/lib/data.ts");
const form = (row?: RoomRecord, patch: Record<string, unknown> = {}) => {
  const values = { roomId: row?.id ?? "", revision: row?.revision ?? "", code: row?.code ?? "TEST-900", building: row?.building ?? "Synthetic", roomType: row?.roomType ?? "classroom", capacity: row?.capacity ?? "", owningDepartmentId: row?.owningDepartmentId ?? "", notes: row?.notes ?? "", capabilities: row?.capabilities ?? [], ...patch };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const entry of Array.isArray(value) ? value : [value]) data.append(key, String(entry));
  return data;
};
const rooms = () => db.select().from(s.rooms).orderBy(s.rooms.id);
const events = () => db.select().from(s.auditEvents).where(eq(s.auditEvents.entity, "room"));
async function main() {
  const lines: string[] = [];
  const [cse, eee] = await db.select().from(s.departments).orderBy(s.departments.id);
  const roleCases = [
    ["system_administrator", null, true], ["academic_administrator", cse.id, true], ["routine_coordinator", cse.id, true],
    ["routine_coordinator", eee.id, false], ["academic_administrator", eee.id, false], ["teacher", cse.id, false],
    ["read_only_viewer", null, false], ["department_approver", null, false], ["accounts_officer", null, false],
  ] as const;
  const original = JSON.stringify(await rooms());
  const digest = JSON.stringify(await db.select().from(s.scheduleVersions).orderBy(s.scheduleVersions.id));
  for (let i = 0; i < roleCases.length; i++) {
    const [role, departmentId, allowed] = roleCases[i];
    const email = `room-role-${i}@example.invalid`;
    const [user] = await db.insert(s.portalUsers).values({ email, displayName: `Synthetic ${role}`, status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role, departmentId });
    signInAs(email);
    const actor = (await getOptionalActor())!;
    assert.equal(await can(actor, "manage_rooms"), allowed);
    if (!allowed) {
      assert.equal((await saveRoomAction(null, form())).outcome?.kind, "permission");
      await assert.rejects(getRoomChanges(1), /permission/);
      await assert.rejects(loadRoomChangesAction(1, 1), /permission/);
      await assert.rejects(requireRoomEditor("/rooms/new"), (error: unknown) => error instanceof RedirectSignal && error.location === "/forbidden");
    }
    await db.update(s.roleAssignments).set({ activeTo: new Date(0) }).where(eq(s.roleAssignments.userId, user.id));
    assert.equal((await saveRoomAction(null, form())).outcome?.kind, "permission", "expired/revoked role denied");
  }
  signInAs(null);
  assert.deepEqual((await saveRoomAction(null, form())).outcome, { kind: "permission", reason: "unauthenticated" });
  await assert.rejects(getRoomChanges(1), /Sign in/);
  assert.equal(JSON.stringify(await rooms()), original);
  assert.equal((await events()).length, 0);
  lines.push("Real server guard matrix: global/CSE administrators and coordinator allowed; other roles, EEE-only, no session and ended grants denied; edit/history payloads guarded before read");
  signInAs("admin@example.invalid");
  const created = await saveRoomAction(null, form(undefined, { isActive: false, owningDepartmentId: eee.id, capacity: "80" }));
  assert.equal(created.ok, true, created.message);
  let row = (await rooms()).find((room) => room.code === "TEST-900")!;
  assert.equal(row.isActive, true);
  assert.equal(row.revision, 1);
  await db.update(s.rooms).set({ isActive: false }).where(eq(s.rooms.id, row.id));
  row = (await rooms()).find((room) => room.id === row.id)!;
  const duplicate = await saveRoomAction(null, form(undefined, { code: " test-900 " }));
  assert.equal(duplicate.outcome?.kind, "validation");
  assert.ok(duplicate.outcome?.kind === "validation" && duplicate.outcome.fieldErrors.code);
  for (const patch of [{ roomId: "1e1" }, { roomId: row.id, revision: "-1" }, { code: "bad/code" }, { capacity: "0" }, { capabilities: ["new-token"] }]) assert.equal((await saveRoomAction(null, form(undefined, patch))).ok, false);
  const noOp = await saveRoomAction(null, form(row));
  assert.equal(noOp.message, "Nothing changed.");
  assert.equal((await events()).length, 1);
  // Direct callers can submit File values even though the rendered controls are text.
  // Invalid IDs must never turn an edit into a create; bad optional values must
  // never silently become Unknown/not recorded.
  const malformedBefore = JSON.stringify(await rooms());
  for (const key of ["roomId", "revision", "capacity", "owningDepartmentId", "notes"] as const) {
    const malformed = form(undefined, { code: `BAD-FILE-${key.toUpperCase()}` });
    malformed.set(key, new File(["invalid"], "synthetic.txt", { type: "text/plain" }));
    const result = await saveRoomAction(null, malformed);
    assert.equal(result.outcome?.kind, "validation", `non-text ${key}: ${result.message}`);
    assert.equal(result.ok, false);
  }
  assert.equal((await saveRoomAction(null, form(undefined, { code: "BAD-REVISION", revision: "not-a-revision" }))).outcome?.kind, "validation");
  assert.equal(JSON.stringify(await rooms()), malformedBefore, "malformed forms write no room");
  assert.equal((await events()).length, 1, "malformed forms write no audit");
  await assert.rejects(loadRoomChangesAction([row.id] as unknown as number, 1), /Invalid room history request/);
  await assert.rejects(loadRoomChangesAction(row.id, [1] as unknown as number), /Invalid room history request/);
  const saved = await saveRoomAction(null, form(row, { code: "TEST-901", notes: "Correction" }));
  assert.equal(saved.ok, true, saved.message);
  assert.equal((await saveRoomAction(null, form(row, { notes: "Lost update" }))).outcome?.kind, "stale");
  row = (await rooms()).find((room) => room.id === row.id)!;
  assert.equal(row.revision, 2);
  assert.equal(row.notes, "Correction");
  assert.equal(row.isActive, false, "directory correction does not reactivate an inactive room");
  const history = await getRoomChanges(row.id);
  assert.equal(history.changes.length, 2);
  assert.equal(history.changes[0].actor, "Synthetic Admin");
  assert.deepEqual(history.changes[0].before, { code: "TEST-900", notes: null });
  lines.push("Create/edit uses stable ID, preserves status/owner access, translates duplicates; no-op has no event/revision; stale edit cannot overwrite; history follows rename with stored actor and before/after");
  const lab = (await rooms()).find((room) => room.code === "SX-406")!;
  const blocked = await saveRoomAction(null, form(lab, { roomType: "classroom" }));
  assert.equal(blocked.outcome?.kind, "conflict");
  const unknown = (await rooms()).find((room) => room.code === "SX-101")!;
  const warn = await saveRoomAction(null, form(unknown, { capacity: "100" }));
  assert.ok(warn.warningFingerprint, warn.message);
  const changedCandidate = await saveRoomAction(null, form(unknown, { capacity: "101", acknowledge: "on", warningFingerprint: warn.warningFingerprint }));
  assert.ok(changedCandidate.warningFingerprint && changedCandidate.warningFingerprint !== warn.warningFingerprint);
  const [merged] = await db.select().from(s.teachingGroups).where(eq(s.teachingGroups.externalAudienceLabel, "EEE-22B"));
  await db.update(s.teachingGroups).set({ externalStudentCount: 10 }).where(eq(s.teachingGroups.id, merged.id));
  const changedEvidence = await saveRoomAction(null, form(unknown, { capacity: "100", acknowledge: "on", warningFingerprint: warn.warningFingerprint }));
  assert.ok(changedEvidence.warningFingerprint && changedEvidence.warningFingerprint !== warn.warningFingerprint);
  const acknowledged = await saveRoomAction(null, form(unknown, { capacity: "100", acknowledge: "on", warningFingerprint: changedEvidence.warningFingerprint }));
  assert.equal(acknowledged.ok, true, acknowledged.message);
  const latest = (await getRoomChanges(unknown.id)).changes[0];
  assert.ok(latest.warnings.length);
  assert.equal((await saveRoomAction(null, form(lab, { roomType: "classroom", acknowledge: "on", warningFingerprint: warn.warningFingerprint }))).outcome?.kind, "conflict");
  lines.push("Unknown merged/external audience warns; candidate and changed reference evidence refresh acknowledgement; blocker cannot be bypassed; acknowledged warning summaries audited");
  for (let i = 0; i < 22; i++) {
    row = (await rooms()).find((room) => room.id === row.id)!;
    assert.equal((await saveRoomAction(null, form(row, { notes: `Synthetic change ${i}` }))).ok, true);
  }
  const first = await getRoomChanges(row.id);
  assert.equal(first.changes.length, 20); assert.ok(first.next);
  const older = await loadRoomChangesAction(row.id, first.next!);
  assert.equal(new Set([...first.changes, ...older.changes].map((event) => event.id)).size, 24);
  assert.equal(older.next, null);
  const live = await getPortalData();
  assert.ok(live.rooms.some((room) => room.code === "TEST-901"));
  assert.equal(JSON.stringify(await db.select().from(s.scheduleVersions).orderBy(s.scheduleVersions.id)), digest);
  lines.push("History >20 events pages without overlap; live directory shows rename; all published/superseded version rows and JSON remain identical");
  if (process.env.SAFE01_PG_TARGET) await actionRaces(lines);
  report({ lines });
}

/** Database audit-trigger barrier holds the real FIRST action after its writes, before commit.
 * The second production action must block on the shared room row. No action or room helper is mocked.
 */
async function actionRaces(lines: string[]) {
  const { createMeetingAction, updateMeetingAction, createExternalAction } = loadApp<typeof MeetingActions>("src/lib/actions.ts");
  const { applyAutoScheduleAction } = loadApp<typeof AcademicActions>("src/lib/academic-actions.ts");
  const { buildAutoSchedulePlan } = loadApp<typeof Automation>("src/lib/schedule-automation.ts");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const control = await pool.connect();
  const query = (text: string) => pool.query(text);
  let sequence = 0;
  await query(`create table safe01_rom_barrier(action text); create function safe01_rom_pause() returns trigger language plpgsql as $$ begin if exists(select 1 from safe01_rom_barrier b where b.action = NEW.action) then perform set_config('application_name', 'rom01a-first-action', true); perform pg_advisory_xact_lock(741001); end if; return NEW; end $$; create trigger safe01_rom_pause before insert on audit_events for each row execute function safe01_rom_pause();`);
  async function waitFor(first: boolean) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const result = await query(first
        ? `select count(*) as n from pg_stat_activity where application_name = 'rom01a-first-action' and wait_event = 'advisory'`
        : `select count(*) as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and application_name <> 'rom01a-first-action'`);
      if (Number(result.rows[0].n) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Real action did not reach ${first ? "audit barrier" : "room lock"}`);
  }
  async function overlap(action: string, first: () => Promise<ActionResult>, second: () => Promise<ActionResult>) {
    await query(`delete from safe01_rom_barrier`);
    await pool.query(`insert into safe01_rom_barrier values ($1)`, [action]);
    await control.query(`select pg_advisory_lock(741001)`);
    const firstPending = first();
    // Catch immediately, retaining error for assertion after releasing the SQL barrier.
    const firstResult = firstPending.then((value) => value, (error: unknown) => { throw error; });
    let secondResult: Promise<ActionResult> | undefined;
    try {
      await waitFor(true);
      secondResult = second();
      await waitFor(false);
    } finally { await control.query(`select pg_advisory_unlock(741001)`); }
    return [await firstResult, await secondResult!];
  }
  try {
    const [term] = await db.select().from(s.academicTerms).where(eq(s.academicTerms.status, "active"));
    const [sessional] = await db.select().from(s.courses).where(eq(s.courses.courseType, "sessional"));
    const [baseGroup] = await db.select().from(s.teachingGroups).where(eq(s.teachingGroups.courseId, sessional.id));
    const [baseMeeting] = await db.select().from(s.meetings).where(eq(s.meetings.teachingGroupId, baseGroup.id));
    const teachers = await db.select().from(s.teachers).orderBy(s.teachers.id);
    for (const writer of ["create", "update", "auto", "od"] as const) for (const editFirst of [true, false]) {
      // Each scenario has a fresh room and a valid known sessional audience.
      await db.update(s.rooms).set({ isActive: false });
      const [target] = await db.insert(s.rooms).values({ code: `ACTION-RACE-${++sequence}`, building: "Synthetic Block", roomType: "lab", capabilities: ["computer"], capacity: 50 }).returning();
      const notesBefore = JSON.stringify(await db.select().from(s.scheduleVersions));
      let groupId = baseGroup.id;
      let unscheduled: number | null = null;
      if (writer === "auto") {
        const [offering] = await db.select().from(s.courseOfferings).where(eq(s.courseOfferings.courseId, sessional.id));
        const [group] = await db.insert(s.teachingGroups).values({ termId: term.id, courseId: sessional.id }).returning();
        groupId = group.id; unscheduled = group.id;
        await db.insert(s.teachingGroupOfferings).values({ teachingGroupId: group.id, offeringId: offering.id });
        await db.insert(s.teachingRequirements).values({ teachingGroupId: group.id, expectedWeeklyMinutes: 150, requiredMeetingsPerWeek: 1 });
        await db.insert(s.workloadAllocations).values({ termId: term.id, teacherId: teachers[1].id, teachingGroupId: group.id, units: "1" });
        assert.ok((await buildAutoSchedulePlan()).plan.suggestions.some((item) => item.teachingGroupId === group.id), "real auto plan includes known sessional");
      }
      const edit = () => saveRoomAction(null, form(target, { capacity: writer === "od" ? "60" : "1" }));
      const write = () => writer === "create" ? createMeetingAction(form(undefined, { teachingGroupId: groupId, dayOfWeek: "0", startTime: "11:00", endTime: "12:15", teacherIds: [teachers[0].id], roomIds: [target.id] }))
        : writer === "update" ? updateMeetingAction(baseMeeting.id, { dayOfWeek: baseMeeting.dayOfWeek, startMinutes: baseMeeting.startMinutes, endMinutes: baseMeeting.endMinutes, teacherIds: [teachers[0].id, teachers[1].id], roomIds: [target.id], isException: false, exceptionNote: null })
        : writer === "auto" ? applyAutoScheduleAction()
        : createExternalAction(form(undefined, { kind: "unresolved_note", counterpartDepartment: "Synthetic OD", roomId: target.id }));
      const action = editFirst ? "room.update" : writer === "create" ? "meeting.create" : writer === "update" ? "meeting.update" : writer === "auto" ? "meeting.auto_create" : "external.create";
      const [first, second] = await overlap(action, editFirst ? edit : write, editFirst ? write : edit);
      assert.equal(first.ok, true, `${writer} first: ${first.message}`);
      if (writer === "od") assert.equal(second.ok, editFirst, second.message);
      else assert.equal(second.outcome?.kind, "conflict", `${writer} second: ${second.message}`);
      if (writer === "auto" && editFirst) assert.equal((await db.select().from(s.meetings).where(eq(s.meetings.teachingGroupId, groupId))).length, 0, "real auto failure inserts no class");
      assert.equal(JSON.stringify(await db.select().from(s.scheduleVersions)), notesBefore);
      // Retain synthetic rows but retire their events from the next placement scenario.
      await query(`delete from safe01_rom_barrier`);
      if (unscheduled) await db.update(s.teachingGroups).set({ deliveryMode: "teacher_managed" }).where(eq(s.teachingGroups.id, unscheduled));
      await db.update(s.meetings).set({ status: "cancelled" }).where(eq(s.meetings.teachingGroupId, groupId));
      // Restore the fixture's base sessional event for the next update action.
      await db.update(s.meetings).set({ status: "active" }).where(eq(s.meetings.id, baseMeeting.id));
      const [originalLab] = await db.select().from(s.rooms).where(eq(s.rooms.code, "SX-406"));
      await db.update(s.meetingRooms).set({ roomId: originalLab.id }).where(eq(s.meetingRooms.meetingId, baseMeeting.id));
    }
    lines.push("Unmocked PostgreSQL production actions: manual create, update, actual auto plan/apply and OD insertion race room edits in both commit orders at audit/row-lock barriers; unsafe loser refused; real auto refusal inserts no batch; snapshots unchanged");
  } finally {
    await control.query(`select pg_advisory_unlock_all()`);
    await query(`drop trigger safe01_rom_pause on audit_events; drop function safe01_rom_pause(); drop table safe01_rom_barrier;`);
    control.release(); await pool.end();
  }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
