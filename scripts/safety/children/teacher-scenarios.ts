/**
 * TCH-01 (#4) production-path child: the real teacher actions and loaders,
 * signed in as each role, on the pinned owned database. Prints one JSON report.
 *   all <adminEmail> <coordinatorEmail> <teacherEmail>
 */
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type * as DbModule from "../../../src/db";
import type * as SchemaModule from "../../../src/db/schema";
import type * as TeacherActions from "../../../src/lib/teacher-actions";
import type * as MeetingActions from "../../../src/lib/actions";
import type * as DataModule from "../../../src/lib/data";
import type { ActionResult } from "../../../src/lib/action-result";

const { db } = loadApp<typeof DbModule>("src/db/index.ts");
const schema = loadApp<typeof SchemaModule>("src/db/schema.ts");
const { saveTeacherAction, setTeacherStatusAction, deleteTeacherAction } = loadApp<typeof TeacherActions>("src/lib/teacher-actions.ts");
const { updateMeetingAction } = loadApp<typeof MeetingActions>("src/lib/actions.ts");
const { getPortalData } = loadApp<typeof DataModule>("src/lib/data.ts");

const PHONE = "+880-1999-424242";
const form = (values: Record<string, string | number | null | undefined>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) if (value != null) data.set(key, String(value));
  return data;
};
const teacherByCode = async (code: string) => (await db.select().from(schema.teachers).where(eq(schema.teachers.shortCode, code)))[0];
// Teacher audit events only: a first sign-in of an invited account writes its own activation event.
const auditCount = async () => (await db.select({ id: schema.auditEvents.id }).from(schema.auditEvents).where(eq(schema.auditEvents.entity, "teacher"))).length;
const versionsDigest = async () => JSON.stringify(await db.select().from(schema.scheduleVersions).orderBy(schema.scheduleVersions.id));
const kind = (result: ActionResult) => result.outcome?.kind ?? (result.ok ? "success" : "unknown");
const fieldsOf = (result: ActionResult) => result.outcome?.kind === "validation" ? Object.keys(result.outcome.fieldErrors).sort() : [];

async function all(adminEmail: string, coordinatorEmail: string, teacherEmail: string) {
  const lines: string[] = [];
  const outputs: string[] = [];
  const keep = (result: ActionResult) => { outputs.push(JSON.stringify(result)); return result; };
  const [cse] = await db.select().from(schema.departments).where(eq(schema.departments.code, "CSE"));
  const versionsBefore = await versionsDigest();
  const valid = { shortCode: "ZZN", fullName: "Synthetic New Teacher", designation: "Lecturer", employmentType: "full_time", homeDepartmentId: cse.id, email: "zzn@example.invalid", phonePrivate: PHONE, advisoryLoadUnits: "12.5" };

  // AC-02: no session and a teacher are denied every action, with no change and no audit.
  const auditBefore = await auditCount();
  const sya = await teacherByCode("SYA");
  for (const [who, expected] of [[null, "unauthenticated"], [teacherEmail, "forbidden"]] as const) {
    signInAs(who);
    const results = [
      await saveTeacherAction(null, form(valid)),
      await saveTeacherAction(null, form({ ...valid, teacherId: sya.id, expectedUpdatedAt: sya.updatedAt.toISOString() })),
      await setTeacherStatusAction(null, form({ teacherId: sya.id, expectedUpdatedAt: sya.updatedAt.toISOString(), action: "set_on_leave" })),
      await deleteTeacherAction(null, form({ teacherId: sya.id, expectedUpdatedAt: sya.updatedAt.toISOString(), confirmCode: "SYA" })),
    ].map(keep);
    for (const result of results) {
      assert.equal(result.ok, false);
      assert.deepEqual(result.outcome, { kind: "permission", reason: expected }, `${who ?? "no session"}: ${result.message}`);
    }
  }
  assert.equal(await auditCount(), auditBefore, "denied actions write no audit");
  assert.equal(await teacherByCode("ZZN"), undefined);
  assert.equal((await teacherByCode("SYA")).status, sya.status);
  lines.push("Denied: no session (unauthenticated) and the teacher role (forbidden) for add, edit, status and delete; nothing changed, no audit");

  // AC-05: a viewer without private contacts never receives a phone.
  signInAs(teacherEmail);
  const teacherView = await getPortalData();
  assert.ok(teacherView.teachers.every((t) => t.phone == null), "no phone for the teacher role");

  // AC-01, AC-03: a coordinator adds a teacher; validation reports every field, including a taken code.
  signInAs(coordinatorEmail);
  const bad = keep(await saveTeacherAction(null, form({ ...valid, shortCode: "sya", email: "nope", advisoryLoadUnits: "41", homeDepartmentId: 999999 })));
  assert.deepEqual(fieldsOf(bad), ["advisoryLoadUnits", "email", "homeDepartmentId", "shortCode"]);
  assert.match(JSON.stringify(bad), /SYA is already used by Synthetic Teacher A/);
  const created = keep(await saveTeacherAction(null, form(valid)));
  assert.equal(created.ok, true, created.message);
  const zzn = await teacherByCode("ZZN");
  assert.deepEqual([zzn.status, zzn.employmentType, zzn.advisoryLoadUnits, zzn.phonePrivate, zzn.email], ["active", "full_time", "12.5", PHONE, "zzn@example.invalid"]);
  lines.push("Coordinator adds a teacher; one save reports a taken code (case-insensitive), a bad email, an out-of-range limit and an unknown department together");

  // AC-04: edit saves and audits only the changed fields; a stale edit changes nothing.
  signInAs(adminEmail);
  const edited = keep(await saveTeacherAction(null, form({ ...valid, teacherId: zzn.id, expectedUpdatedAt: zzn.updatedAt.toISOString(), fullName: "Synthetic Renamed Teacher", phonePrivate: "+880-1999-515151" })));
  assert.equal(edited.ok, true, edited.message);
  const stale = keep(await saveTeacherAction(null, form({ ...valid, teacherId: zzn.id, expectedUpdatedAt: zzn.updatedAt.toISOString(), fullName: "Lost Update" })));
  assert.deepEqual(stale.outcome, { kind: "stale", reason: "changed" });
  const afterEdit = await teacherByCode("ZZN");
  assert.equal(afterEdit.fullName, "Synthetic Renamed Teacher");
  const unchanged = keep(await saveTeacherAction(null, form({ ...valid, teacherId: zzn.id, expectedUpdatedAt: afterEdit.updatedAt.toISOString(), fullName: "Synthetic Renamed Teacher", phonePrivate: "+880-1999-515151" })));
  assert.equal(unchanged.message, "Nothing changed.");
  const [update] = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.action, "teacher.update"));
  assert.deepEqual([update.before, update.after, update.detail], [{ fullName: "Synthetic New Teacher" }, { fullName: "Synthetic Renamed Teacher" }, { fields: ["fullName", "phonePrivate"], phoneChanged: true }]);
  lines.push("Edit audits only changed fields (phone as a flag); a stale edit is refused unchanged; a no-op save writes nothing");

  // AC-06: deactivation is blocked by active-term work, allowed without it; inactive teachers are refused for new classes.
  const blocked = keep(await setTeacherStatusAction(null, form({ teacherId: sya.id, expectedUpdatedAt: sya.updatedAt.toISOString(), action: "deactivate" })));
  assert.equal(blocked.outcome?.kind, "conflict");
  assert.deepEqual(blocked.issues?.map((issue) => issue.title.replace(/^\d+ /, "")), ["classes in the working routine", "workload allocations"]);
  assert.equal((await teacherByCode("SYA")).status, "active");
  const deactivated = keep(await setTeacherStatusAction(null, form({ teacherId: zzn.id, expectedUpdatedAt: afterEdit.updatedAt.toISOString(), action: "deactivate", reason: "Synthetic reason" })));
  assert.equal(deactivated.ok, true, deactivated.message);
  const inactive = await teacherByCode("ZZN");
  assert.equal(inactive.status, "inactive");
  const [meeting] = await db.select().from(schema.meetingTeachers).where(eq(schema.meetingTeachers.teacherId, sya.id)).limit(1);
  const [meetingRow] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, meeting.meetingId));
  const roomIds = (await db.select().from(schema.meetingRooms).where(eq(schema.meetingRooms.meetingId, meeting.meetingId))).map((row) => row.roomId);
  const assign = keep(await updateMeetingAction(meeting.meetingId, {
    dayOfWeek: meetingRow.dayOfWeek, startMinutes: meetingRow.startMinutes, endMinutes: meetingRow.endMinutes,
    teacherIds: [sya.id, zzn.id], roomIds, isException: meetingRow.isException, exceptionNote: meetingRow.exceptionNote,
  }));
  assert.equal(assign.ok, false);
  assert.match(assign.message, /ZZN is inactive/);
  const reactivated = keep(await setTeacherStatusAction(null, form({ teacherId: zzn.id, expectedUpdatedAt: inactive.updatedAt.toISOString(), action: "reactivate" })));
  assert.equal(reactivated.ok, true);
  lines.push("Deactivate refused while SYA has active-term classes and allocations; allowed for an unused teacher; an inactive teacher cannot be added to a class; reactivate restores");

  // AC-07: delete only an unused record whose code no publication shows, with the typed code.
  const used = keep(await deleteTeacherAction(null, form({ teacherId: sya.id, expectedUpdatedAt: (await teacherByCode("SYA")).updatedAt.toISOString(), confirmCode: "SYA" })));
  assert.equal(used.outcome?.kind, "conflict");
  assert.match(JSON.stringify(used.issues), /routine class|attendance session/);
  const [published] = await db.insert(schema.teachers).values({ shortCode: "SYP", fullName: "Synthetic Published", homeDepartmentId: cse.id }).returning();
  const termId = (await db.select().from(schema.academicTerms).limit(1))[0].id;
  await db.insert(schema.scheduleVersions).values({ termId, versionNumber: 99, state: "superseded", snapshot: { metadata: { teachers: [{ shortCode: "SYP" }] } } });
  const inSnapshot = keep(await deleteTeacherAction(null, form({ teacherId: published.id, expectedUpdatedAt: published.updatedAt.toISOString(), confirmCode: "SYP" })));
  assert.match(JSON.stringify(inSnapshot.issues), /publication v99/);
  const fresh = await teacherByCode("ZZN");
  const wrong = keep(await deleteTeacherAction(null, form({ teacherId: fresh.id, expectedUpdatedAt: fresh.updatedAt.toISOString(), confirmCode: "ZZX" })));
  assert.deepEqual(fieldsOf(wrong), ["confirmCode"]);
  const deleted = keep(await deleteTeacherAction(null, form({ teacherId: fresh.id, expectedUpdatedAt: fresh.updatedAt.toISOString(), confirmCode: "zzn" })));
  assert.equal(deleted.ok, true, deleted.message);
  assert.equal(await teacherByCode("ZZN"), undefined);
  lines.push("Delete refused for a used teacher and for a code in a publication snapshot; a wrong typed code is a field error; an unused record is deleted");

  // AC-08: placeholders.
  const [unresolved, vacancy] = await db.insert(schema.teachers).values([
    { shortCode: "SYU", fullName: "Unresolved teacher (SYU)", status: "unresolved", employmentType: null, homeDepartmentId: cse.id },
    { shortCode: "SYV", fullName: "Upcoming Teacher", status: "vacancy", employmentType: null, homeDepartmentId: cse.id },
  ]).returning();
  await db.insert(schema.meetingTeachers).values({ meetingId: meeting.meetingId, teacherId: unresolved.id });
  const editUnresolved = keep(await saveTeacherAction(null, form({ ...valid, shortCode: "SYU", teacherId: unresolved.id, expectedUpdatedAt: unresolved.updatedAt.toISOString() })));
  assert.equal(editUnresolved.outcome?.kind, "conflict");
  const resolved = keep(await saveTeacherAction(null, form({ ...valid, shortCode: "IGNORED", fullName: "Synthetic Resolved", employmentType: "guest", phonePrivate: "", teacherId: unresolved.id, expectedUpdatedAt: unresolved.updatedAt.toISOString(), resolve: "1" })));
  assert.equal(resolved.ok, true, resolved.message);
  const after = await teacherByCode("SYU");
  assert.deepEqual([after.status, after.employmentType, after.fullName], ["active", "guest", "Synthetic Resolved"]);
  assert.equal((await db.select().from(schema.meetingTeachers).where(eq(schema.meetingTeachers.teacherId, unresolved.id))).length, 1, "classes kept");
  for (const action of ["deactivate", "set_on_leave"]) {
    const refused = keep(await setTeacherStatusAction(null, form({ teacherId: vacancy.id, expectedUpdatedAt: vacancy.updatedAt.toISOString(), action })));
    assert.equal(refused.outcome?.kind, "conflict");
  }
  const editVacancy = keep(await saveTeacherAction(null, form({ ...valid, shortCode: "SYV", teacherId: vacancy.id, expectedUpdatedAt: vacancy.updatedAt.toISOString() })));
  assert.match(editVacancy.message, /vacancy marker/);
  lines.push("Placeholders: an unresolved code is resolved into an active teacher keeping its class (code fixed); UT-style vacancy cannot be edited, deactivated or set on leave");

  // AC-05, AC-11: no phone in any audit event or action output; publications untouched (apart from the planted v99).
  const audit = JSON.stringify(await db.select().from(schema.auditEvents).where(inArray(schema.auditEvents.entity, ["teacher"])));
  for (const phone of [PHONE, "+880-1999-515151"]) {
    assert.ok(!audit.includes(phone.slice(-6)) && !outputs.join("\n").includes(phone.slice(-6)), "a phone reached the audit or an action result");
  }
  const versions = JSON.parse(await versionsDigest()) as Array<{ versionNumber: number }>;
  assert.equal(JSON.stringify(versions.filter((v) => v.versionNumber !== 99)), JSON.stringify(JSON.parse(versionsBefore)), "published versions unchanged");
  lines.push(`Privacy: ${audit.match(/"action":"teacher\./g)?.length ?? 0} teacher audit events and every action result hold no phone digits; publications unchanged`);

  report({ lines });
}

const [command, ...args] = process.argv.slice(2);
if (command === "all") {
  all(args[0], args[1], args[2]).then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}
