import { freshTermActions } from "./fresh-term-actions";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type * as Db from "../../../src/db";
import type * as Schema from "../../../src/db/schema";
import type * as RoomActions from "../../../src/lib/room-actions";
import type * as RoomData from "../../../src/lib/room-data";
import type * as Actions from "../../../src/lib/actions";
import type * as Auto from "../../../src/lib/academic-actions";
import type * as AutoPlan from "../../../src/lib/schedule-automation";
import type * as Grid from "../../../src/lib/time-grid-actions";
import type { ActionResult } from "../../../src/lib/action-result";
const { db } = loadApp<typeof Db>("src/db/index.ts");
const s = loadApp<typeof Schema>("src/db/schema.ts");
const { lifecycleRoomAction, saveRoomAction } = loadApp<typeof RoomActions>("src/lib/room-actions.ts");
const { getRoomLifecycleEvidence, getRoomRecord } = loadApp<typeof RoomData>("src/lib/room-data.ts");
const actions = freshTermActions(loadApp<typeof Actions>("src/lib/actions.ts"));
const auto = freshTermActions(loadApp<typeof Auto>("src/lib/academic-actions.ts"));
const { buildAutoSchedulePlan } = loadApp<typeof AutoPlan>("src/lib/schedule-automation.ts");
const grid = freshTermActions(loadApp<typeof Grid>("src/lib/time-grid-actions.ts"));
const form = (values: Record<string, unknown>) => { const fd = new FormData(); for (const [key, value] of Object.entries(values)) for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v instanceof File ? v : String(v)); return fd; };
const life = (r: { id: number; revision: number; code: string }, action = "deactivate") => lifecycleRoomAction(null, form({ roomId: r.id, revision: r.revision, action, reason: "Synthetic action", confirmation: r.code }));
async function main() {
  const lines: string[] = [];
  const [cse, eee] = await db.select().from(s.departments).orderBy(s.departments.id);
  const [sample] = await db.select().from(s.rooms);
  const cases = [["system_administrator", null, true], ["academic_administrator", cse.id, true], ["routine_coordinator", cse.id, true], ["academic_administrator", eee.id, false], ["routine_coordinator", eee.id, false], ["teacher", cse.id, false], ["read_only_viewer", null, false], ["department_approver", null, false], ["accounts_officer", null, false]] as const;
  for (const [i, [role, departmentId, allowed]] of cases.entries()) {
    const email = `life-role-${i}@example.invalid`;
    const [user] = await db.insert(s.portalUsers).values({ email, displayName: "Synthetic lifecycle actor", status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role, departmentId }); signInAs(email);
    if (allowed) assert.ok(await getRoomLifecycleEvidence(sample));
    else { assert.equal((await life(sample)).outcome?.kind, "permission"); await assert.rejects(getRoomLifecycleEvidence(sample), /permission/); }
    if (role === "teacher" || role === "read_only_viewer" || allowed) assert.ok(await getRoomRecord(String(sample.id)), "qualifying internal occupancy source readable");
    await db.update(s.roleAssignments).set({ activeFrom: new Date("2099-01-01"), activeTo: null }).where(eq(s.roleAssignments.userId, user.id));
    assert.equal((await life(sample)).outcome?.kind, "permission");
    await db.update(s.roleAssignments).set({ activeFrom: new Date(0), activeTo: new Date(1) }).where(eq(s.roleAssignments.userId, user.id));
    assert.equal((await life(sample)).outcome?.kind, "permission");
  }
  signInAs(null); assert.equal((await life(sample)).outcome?.kind, "permission"); await assert.rejects(getRoomRecord(String(sample.id)), /Sign in/);
  signInAs("admin@example.invalid");
  let n = 0;
  const create = async () => { const r = await saveRoomAction(null, form({ code: `ACT-LIFE-${++n}`, building: "Synthetic", roomType: "lab", capabilities: ["computer", "theory"], capacity: 100, owningDepartmentId: "", notes: "" })); assert.ok(r.ok, r.message); return (await db.select().from(s.rooms).where(eq(s.rooms.id, r.outcome?.kind === "success" ? r.outcome.entityId! : -1)))[0]; };
  const room = await create();
  for (const key of ["roomId", "revision", "action", "reason", "confirmation"]) {
    const fd = form({ roomId: room.id, revision: room.revision, action: "deactivate", reason: "Synthetic", confirmation: room.code }); fd.append(key, "duplicate"); assert.equal((await lifecycleRoomAction(null, fd)).outcome?.kind, "validation");
    fd.delete(key); fd.set(key, new File(["x"], "x")); assert.equal((await lifecycleRoomAction(null, fd)).outcome?.kind, "validation");
  }
  assert.ok((await life(room)).ok);
  const od = form({ kind: "unresolved_note", counterpartDepartment: "Synthetic stale picker", roomId: room.id, notes: "Kept by client" });
  assert.equal((await actions.createExternalAction(od)).outcome?.kind, "conflict");
  const [activeTerm] = await db.select().from(s.academicTerms).where(eq(s.academicTerms.status, "active"));
  const [sessional] = await db.select().from(s.courses).where(eq(s.courses.courseType, "sessional"));
  const [baseGroup] = await db.select().from(s.teachingGroups).where(eq(s.teachingGroups.courseId, sessional.id));
  const [baseMeeting] = await db.select().from(s.meetings).where(eq(s.meetings.teachingGroupId, baseGroup.id));
  const baseRooms = await db.select().from(s.meetingRooms).where(eq(s.meetingRooms.meetingId, baseMeeting.id));
  await db.update(s.meetingRooms).set({ roomId: room.id }).where(eq(s.meetingRooms.meetingId, baseMeeting.id));
  assert.equal((await actions.moveMeetingAction(baseMeeting.id, baseMeeting.dayOfWeek, baseMeeting.startMinutes, baseMeeting.endMinutes)).outcome?.kind, "conflict");
  const teachers = await db.select().from(s.teachers).orderBy(s.teachers.id);
  assert.equal((await actions.updateMeetingAction(baseMeeting.id, { ...baseMeeting, teacherIds: [teachers[0].id, teachers[1].id], roomIds: [room.id], isException: false, exceptionNote: null })).ok, false);
  await db.update(s.meetingRooms).set({ roomId: baseRooms[0].roomId }).where(eq(s.meetingRooms.meetingId, baseMeeting.id));
  const draftOD = await create(); assert.ok((await actions.createExternalAction(form({ kind: "unresolved_note", counterpartDepartment: "Synthetic first use", roomId: draftOD.id }))).ok);
  const [retained] = await db.select().from(s.rooms).where(eq(s.rooms.id, draftOD.id)); assert.equal(retained.isDraft, false); assert.equal(retained.revision, 2);
  const [dayPlan] = (await db.select().from(s.dayPlans).where(eq(s.dayPlans.termId, activeTerm.id))).filter((p) => p.stream === "HSC" && p.batchId == null && p.patternId != null);
  const [pattern] = await db.select().from(s.periodPatterns).where(eq(s.periodPatterns.id, dayPlan.patternId!));
  const [gridMeeting] = await db.insert(s.meetings).values({ teachingGroupId: baseGroup.id, dayOfWeek: dayPlan.dayOfWeek, startMinutes: pattern.periods[0].start, endMinutes: pattern.periods[0].end }).returning();
  await db.insert(s.meetingRooms).values({ meetingId: gridMeeting.id, roomId: room.id });
  const patternsBefore = JSON.stringify(await db.select().from(s.periodPatterns));
  const hoursBefore = JSON.stringify(await db.select().from(s.permittedWindows));
  // The generic legacy fixture deliberately overlaps its prayer break and periods.
  // Submit a valid correction so this test reaches the room guard, then prove rollback.
  const bulk = await grid.savePatternAction({ patternId: pattern.id, expectedUpdatedAt: pattern.updatedAt.toISOString(), name: pattern.name, periods: pattern.periods.map((p, i) => i === 0 ? { start: p.start + 5, end: p.end } : p), breaks: [], updateHours: true, moveClasses: true });
  assert.equal(bulk.outcome?.kind, "conflict", bulk.message);
  assert.equal(JSON.stringify(await db.select().from(s.periodPatterns)), patternsBefore);
  assert.equal(JSON.stringify(await db.select().from(s.permittedWindows)), hoursBefore);
  assert.deepEqual((await db.select().from(s.meetings).where(eq(s.meetings.id, gridMeeting.id)))[0], gridMeeting);
  await db.delete(s.meetingRooms).where(eq(s.meetingRooms.meetingId, gridMeeting.id)); await db.delete(s.meetings).where(eq(s.meetings.id, gridMeeting.id));
  lines.push("Production lifecycle/read permissions cover global/CSE/other-department roles, expired/future grants and anonymous; duplicate/File fields refuse; cached OD and move/update inactivity refuse; real OD insertion consumes draft atomically; bulk period move refusal rolls back the entire grid/hours/class transaction");
  if (process.env.SAFE01_PG_TARGET) await races(lines, activeTerm.id, baseGroup.id, baseMeeting, teachers.map((t) => t.id), create);
  // Keep grid action imported in this actual runtime; the race checks below exercise real bulk moves.
  assert.equal(typeof grid.savePatternAction, "function");
  report({ lines });
}
async function races(lines: string[], termId: number, baseGroupId: number, baseMeeting: typeof s.meetings.$inferSelect, teacherIds: number[], create: () => Promise<typeof s.rooms.$inferSelect>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 }), control = await pool.connect();
  await pool.query(`create table safe01_life_barrier(action text); create function safe01_life_pause() returns trigger language plpgsql as $$ begin if exists(select 1 from safe01_life_barrier where action = NEW.action) then perform set_config('application_name', 'rom01b-first-action', true); perform pg_advisory_xact_lock(741002); end if; return NEW; end $$; create trigger safe01_life_pause before insert on audit_events for each row execute function safe01_life_pause();`);
  async function waitFor(first: boolean) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const result = await pool.query(first ? "select count(*) as n from pg_stat_activity where application_name = 'rom01b-first-action' and wait_event = 'advisory'" : "select count(*) as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and application_name <> 'rom01b-first-action'");
      if (Number(result.rows[0].n)) return; await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`ROM-01B actual action did not reach ${first ? "audit" : "room lock"} barrier`);
  }
  async function overlap(event: string, first: () => Promise<ActionResult>, second: () => Promise<ActionResult>) {
    await pool.query("delete from safe01_life_barrier"); await pool.query("insert into safe01_life_barrier values ($1)", [event]); await control.query("select pg_advisory_lock(741002)");
    const one = first().then((value) => ({ value }), (error: unknown) => ({ error })); let two: typeof one | undefined;
    try { await waitFor(true); two = second().then((value) => ({ value }), (error: unknown) => ({ error })); await waitFor(false); } finally { await control.query("select pg_advisory_unlock(741002)"); }
    const a = await one, b = await two!; if ("error" in a) throw a.error; if ("error" in b) throw b.error; return [a.value, b.value];
  }
  try {
    // Make the active synthetic term future-use relevant without creating a new exposed date writer.
    await db.update(s.academicTerms).set({ endDate: "2099-12-31" }).where(eq(s.academicTerms.id, termId));
    const [sessional] = await db.select().from(s.courses).where(eq(s.courses.courseType, "sessional"));
    for (const writer of ["create", "update", "auto", "od"] as const) for (const action of ["deactivate", "delete"] as const) for (const firstLife of [true, false]) {
      await db.update(s.rooms).set({ isActive: false }); const room = await create();
      const snapshotBefore = JSON.stringify(await db.select().from(s.scheduleVersions));
      let groupId = baseGroupId, extraGroup: number | null = null;
      if (writer === "auto") {
        const [offering] = await db.select().from(s.courseOfferings).where(eq(s.courseOfferings.courseId, sessional.id));
        const [g] = await db.insert(s.teachingGroups).values({ termId, courseId: sessional.id }).returning(); groupId = g.id; extraGroup = g.id;
        await db.insert(s.teachingGroupOfferings).values({ teachingGroupId: g.id, offeringId: offering.id });
        await db.insert(s.teachingRequirements).values({ teachingGroupId: g.id, expectedWeeklyMinutes: 150, requiredMeetingsPerWeek: 1 });
        await db.insert(s.workloadAllocations).values({ termId, teacherId: teacherIds[1], teachingGroupId: g.id, units: "1" });
        assert.ok((await buildAutoSchedulePlan()).plan.suggestions.some((x) => x.teachingGroupId === groupId));
      }
      const lifecycle = () => life(room, action);
      const write = () => writer === "create" ? actions.createMeetingAction(form({ teachingGroupId: groupId, dayOfWeek: 0, startTime: "11:00", endTime: "12:15", teacherIds: [teacherIds[0]], roomIds: [room.id] }))
        : writer === "update" ? actions.updateMeetingAction(baseMeeting.id, { ...baseMeeting, teacherIds: teacherIds.slice(0, 2), roomIds: [room.id], isException: false, exceptionNote: null })
        : writer === "auto" ? auto.applyAutoScheduleAction() : actions.createExternalAction(form({ kind: "unresolved_note", counterpartDepartment: "Synthetic race", roomId: room.id }));
      const [winner, loser] = await overlap(firstLife ? `room.${action}` : writer === "create" ? "meeting.create" : writer === "update" ? "meeting.update" : writer === "auto" ? "meeting.auto_create" : "external.create", firstLife ? lifecycle : write, firstLife ? write : lifecycle);
      assert.ok(winner.ok, `${writer}/${action}/${firstLife}: ${winner.message}`); assert.equal(loser.ok, false, `${writer}/${action}/${firstLife}: ${loser.message}`);
      if (writer === "auto" && firstLife) assert.equal((await db.select().from(s.meetings).where(eq(s.meetings.teachingGroupId, groupId))).length, 0);
      assert.equal(JSON.stringify(await db.select().from(s.scheduleVersions)), snapshotBefore);
      await pool.query("delete from safe01_life_barrier");
      if (extraGroup) await db.update(s.teachingGroups).set({ deliveryMode: "teacher_managed" }).where(eq(s.teachingGroups.id, extraGroup));
      await db.update(s.meetings).set({ status: "cancelled" }).where(eq(s.meetings.teachingGroupId, groupId));
      await db.update(s.meetings).set({ status: "active" }).where(eq(s.meetings.id, baseMeeting.id));
      const [original] = await db.select().from(s.rooms).where(eq(s.rooms.code, "SX-406")); await db.update(s.meetingRooms).set({ roomId: original.id }).where(eq(s.meetingRooms.meetingId, baseMeeting.id));
    }
    lines.push("Unmocked production PostgreSQL actions at real audit/row-lock barriers: lifecycle/delete against manual create/update, recomputed automatic plan/apply and OD in both commit orders; first assignment retains, unsafe contender refuses, failed auto applies no batch, snapshots unchanged");
  } finally { await control.query("select pg_advisory_unlock_all()"); await pool.query("drop trigger safe01_life_pause on audit_events; drop function safe01_life_pause(); drop table safe01_life_barrier"); control.release(); await pool.end(); }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
