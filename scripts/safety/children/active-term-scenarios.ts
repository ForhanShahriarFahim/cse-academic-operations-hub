/** Real production loaders/actions on pinned zero/one/legacy-duplicate storage. */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { loadApp, report, signInAs } from "./controlled-runtime";
import { fingerprintDatabase } from "../fingerprint";
import type { ActionResult } from "../../../src/lib/action-result";

const { db } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const data = loadApp<typeof import("../../../src/lib/data")>("src/lib/data.ts");
const active = loadApp<typeof import("../../../src/lib/active-term")>("src/lib/active-term.ts");
const state = loadApp<typeof import("../../../src/lib/term-state")>("src/lib/term-state.ts");
const refs = loadApp<typeof import("../../../src/lib/teacher-data")>("src/lib/teacher-data.ts");
const scope = loadApp<typeof import("../../../src/lib/term-scope")>("src/lib/term-scope.ts");
const pub = loadApp<typeof import("../../../src/lib/public-routine")>("src/lib/public-routine.ts");
const actions = loadApp<typeof import("../../../src/lib/actions")>("src/lib/actions.ts");
const academic = loadApp<typeof import("../../../src/lib/academic-actions")>("src/lib/academic-actions.ts");
const grid = loadApp<typeof import("../../../src/lib/time-grid-actions")>("src/lib/time-grid-actions.ts");
const teachers = loadApp<typeof import("../../../src/lib/teacher-actions")>("src/lib/teacher-actions.ts");
type Route = { GET(request: Request): Promise<Response> };
const internalCsv = loadApp<Route>("src/app/(portal)/routine/export/route.ts");
const publicCsv = loadApp<Route>("src/app/public/routine/export/route.ts");
const form = (values: Record<string, string | number>) => { const f = new FormData(); for (const [key, value] of Object.entries(values)) f.append(key, String(value)); return f; };
const failure = (kind: string) => (error: unknown) => error instanceof state.ActiveTermUnavailable && error.problem === kind;

async function main() {
  const mode = process.argv[2]; const lines: string[] = [];
  signInAs("admin@example.invalid");
  const [term] = await db.select().from(s.academicTerms).where(eq(s.academicTerms.name, "Summer 2026"));
  const [teacher] = await db.select().from(s.teachers).where(eq(s.teachers.shortCode, "SYA"));
  const [meeting] = await db.select().from(s.meetings);
  const [room] = await db.select().from(s.rooms);
  const [external] = await db.select().from(s.externalCommitments);
  const [extra] = await db.select().from(s.extraLoadClasses);
  const [manual] = await db.select().from(s.extraLoadManualSummaries);
  const [session] = await db.select().from(s.attendanceSessions);
  const [student] = await db.select().from(s.students);
  const [pattern] = await db.select().from(s.periodPatterns);
  const [plan] = await db.select().from(s.dayPlans);
  const raw = (db as unknown as { $client: import("../database").Queryable }).$client;
  const before = await fingerprintDatabase(raw);
  const resolved = await active.readActiveTerm();
  assert.equal(resolved.kind, mode === "one" ? "one" : mode);
  const internal = () => internalCsv.GET(new Request("http://safe01.invalid/routine/export?stream=HSC&view=week"));
  const published = () => publicCsv.GET(new Request("http://safe01.invalid/public/routine/export?stream=HSC&view=week"));
  if (mode === "one") {
    assert.equal((await data.getActiveTerm()).id, term.id);
    assert.equal((await data.getTermPublicationState())?.termName, term.name);
    assert.equal((await data.getPortalData()).term.id, term.id);
    assert.equal(await scope.isInActiveTerm("meeting", meeting.id), true);
    assert.equal((await internal()).status, 200);
    // The generic fixture has unsupported legacy publication JSON: optional public absence is preserved.
    assert.equal(await pub.getPublicRoutineData(), null);
    await assert.rejects(db.transaction(async tx => {
      await tx.update(s.academicTerms).set({ status: "draft" }).where(eq(s.academicTerms.id, term.id));
      assert.equal((await active.readActiveTerm(tx)).kind, "none");
      const reference = await refs.getTeacherReferences(teacher.id, teacher.shortCode, tx);
      assert.equal(reference.termName, "No active term"); assert.equal(reference.activeTerm.classes.length, 0);
      throw new Error("BUG28 transaction visibility rollback");
    }), /BUG28 transaction visibility rollback/);
    lines.push("Sole-active real portal/summary/CSV/scope readers preserve existing contracts; transactional teacher-reference reader observes its own uncommitted zero-active state, then rolls back without changing history.");
  } else {
    await assert.rejects(data.getActiveTerm(), failure(mode));
    await assert.rejects(data.getPortalData(), failure(mode));
    assert.equal(await scope.isInActiveTerm("meeting", meeting.id), false);
    assert.equal(await scope.isInActiveTerm("meeting", 2147483647), true, "missing record contract");
    const response = await internal(); assert.equal(response.status, 503); assert.equal(response.headers.get("Content-Disposition"), null); assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { error: state.PUBLIC_TERM_MESSAGE });
    if (mode === "ambiguous") {
      await assert.rejects(data.getTermPublicationState(), failure(mode));
      await assert.rejects(pub.getPublicRoutineData(), failure(mode));
      await assert.rejects(refs.getTeacherReferences(teacher.id, teacher.shortCode), failure(mode));
      const response = await published(); assert.equal(response.status, 503); assert.equal(response.headers.get("Content-Disposition"), null); assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(await response.json(), { error: state.PUBLIC_TERM_MESSAGE });
    } else {
      assert.equal(await data.getTermPublicationState(), null); assert.equal(await pub.getPublicRoutineData(), null); assert.equal((await published()).status, 404);
      const reference = await refs.getTeacherReferences(teacher.id, teacher.shortCode);
      assert.equal(reference.termName, "No active term"); assert.equal(reference.activeTerm.classes.length, 0); assert.ok(reference.anyTerm.classes > 0);
    }
    const group = meeting.teachingGroupId;
    const attempts: Array<[string, () => Promise<ActionResult>]> = [
      ["createMeeting", () => actions.createMeetingAction(form({ teachingGroupId: group, dayOfWeek: 0, startTime: "9:00 AM", endTime: "10:00 AM", teacherIds: teacher.id, roomIds: room.id }))],
      ["moveMeeting", () => actions.moveMeetingAction(meeting.id, 1, 900, 975)],
      ["updateMeeting", () => actions.updateMeetingAction(meeting.id, { dayOfWeek: 1, startMinutes: 900, endMinutes: 975, teacherIds: [teacher.id], roomIds: [room.id], isException: false, exceptionNote: null })],
      ["deleteMeeting", () => actions.deleteMeetingAction(meeting.id)],
      ["createExternal", () => actions.createExternalAction(form({ kind: "unresolved_note", counterpartDepartment: "Synthetic EEE", notes: "Unchanged" }))],
      ["verifyExternal", () => actions.verifyExternalAction(external.id)], ["deleteExternal", () => actions.deleteExternalAction(external.id)],
      ["publish", () => actions.publishAction("Must refuse")],
      ["policy", () => academic.updateAcademicPolicyAction(form({}))],
      ["createExtra", () => academic.createExtraLoadClassAction(form({ teacherId: teacher.id, teachingGroupId: group, classDate: "2026-06-13", startTime: "9:00 AM", endTime: "10:00 AM" }))],
      ["deleteExtra", () => academic.deleteExtraLoadClassAction(extra.id)],
      ["createManual", () => academic.createManualTopSheetRowAction(form({ teacherName: "Synthetic", classCount: 1 }))],
      ["deleteManual", () => academic.deleteManualTopSheetRowAction(manual.id)],
      ["upsertStudent", () => academic.upsertStudentAction(form({ teachingGroupId: group, studentCode: "SYN-new", fullName: "Synthetic New" }))],
      ["importStudents", () => academic.importStudentCsvAction(form({ teachingGroupId: group, csvText: "Student ID,Student Name\nSYN-new,Synthetic New" }))],
      ["deactivateStudent", () => academic.deactivateStudentAction(student.id, group)],
      ["createAttendance", () => academic.createAttendanceSessionAction(form({ teachingGroupId: group, classDate: "2026-06-13", phase: "midterm" }))],
      ["saveAttendance", () => academic.saveAttendanceAction(session.id, [{ studentId: student.id, status: "excused" }])],
      ["deleteAttendance", () => academic.deleteAttendanceSessionAction(session.id)], ["autoApply", () => academic.applyAutoScheduleAction()],
      ["savePattern", () => grid.savePatternAction({ patternId: pattern.id, expectedUpdatedAt: pattern.updatedAt.toISOString(), name: "Synthetic", periods: pattern.periods, breaks: pattern.breaks, moveClasses: true, updateHours: true })],
      ["deletePattern", () => grid.deletePatternAction(pattern.id, pattern.updatedAt.toISOString())],
      ["setDayPlan", () => grid.setDayPlanAction({ stream: "HSC", batchId: null, dayOfWeek: 0, patternId: pattern.id, hours: { start: 540, end: 900 }, reason: "Synthetic", expectedUpdatedAt: null, moveClasses: true })],
      ["removeException", () => grid.removeExceptionAction(plan.id, plan.updatedAt.toISOString())],
      ["copyGrid", () => grid.copyGridFromTermAction(term.id, 2)],
    ];
    if (mode === "ambiguous") attempts.push(
      ["deactivateTeacher", () => teachers.setTeacherStatusAction(null, form({ teacherId: teacher.id, action: "deactivate", expectedUpdatedAt: teacher.updatedAt.toISOString() }))],
      ["deleteTeacher", () => teachers.deleteTeacherAction(null, form({ teacherId: teacher.id, confirmCode: teacher.shortCode, expectedUpdatedAt: teacher.updatedAt.toISOString() }))],
    );
    for (const [name, run] of attempts) { const result = await run(); assert.equal(result.ok, false, `${mode}/${name}`); assert.match(result.message, /term|configuration/i, `${name}: ${result.message}`); }
    signInAs(null);
    assert.equal((await internal()).status, 401);
    for (const [name, run] of attempts) { const result = await run(); assert.equal(result.ok, false, name); assert.equal(result.outcome?.kind, "permission", `${name}: role precedence`); }
    signInAs("admin@example.invalid");
    lines.push(`${mode}: five real production read sites, ${attempts.length} direct action refusals, anonymous permission precedence, CSV statuses/no attachments/no-store, missing-record and teacher-reference contracts; full fingerprint proves no data/audit/sequence mutation.`);
  }
  await assert.rejects(active.withTermContext(async () => { throw new Error("unexpected driver failure"); }), /unexpected driver failure/);
  assert.deepEqual(await fingerprintDatabase(raw), before);
  report({ lines });
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
