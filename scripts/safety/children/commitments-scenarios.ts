/** OD-01A: real commitment actions and planning reads; only the request/provider boundary is stubbed. */
import assert from "node:assert/strict";
import { asc, eq } from "drizzle-orm";
import { loadApp, report, signInAs } from "./controlled-runtime";
import type { ActionResult } from "../../../src/lib/action-result";
import type { TermWriteContext } from "../../../src/lib/term-context-value";

const { db } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const context = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const od = loadApp<typeof import("../../../src/lib/commitment-actions")>("src/lib/commitment-actions.ts");
const actions = loadApp<typeof import("../../../src/lib/actions")>("src/lib/actions.ts");
const data = loadApp<typeof import("../../../src/lib/data")>("src/lib/data.ts");
const { analyzeSchedule } = loadApp<typeof import("../../../src/lib/conflicts")>("src/lib/conflicts.ts");
const reads = loadApp<typeof import("../../../src/lib/commitment-data")>("src/lib/commitment-data.ts");

const form = (values: Record<string, unknown>) => { const f = new FormData(); for (const [key, value] of Object.entries(values)) f.set(key, String(value)); return f; };
const kind = (r: ActionResult) => r.outcome?.kind ?? (r.ok ? "success" : "unknown");
const ok = (r: ActionResult) => { assert.equal(r.ok, true, `${r.message} ${JSON.stringify(r.outcome)}`); return r; };
const ADMIN = "admin@example.invalid", TEACHER = "teacher-a@example.invalid";
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

async function main() {
  const lines: string[] = [];
  signInAs(ADMIN);
  const token: TermWriteContext = (await context.captureActiveContext()).writeContext;
  await db.update(s.portalUsers).set({ status: "active" }).where(eq(s.portalUsers.email, TEACHER));
  const row = async (id: number) => (await db.select().from(s.externalCommitments).where(eq(s.externalCommitments.id, id)))[0];
  const snapshot = async () => JSON.stringify([await db.select().from(s.externalCommitments).orderBy(asc(s.externalCommitments.id)), await db.select().from(s.auditEvents).orderBy(asc(s.auditEvents.id))]);
  const noWrite = async (work: () => Promise<ActionResult>) => { const before = await snapshot(); const r = await work(); assert.equal(await snapshot(), before, `wrote despite ${r.message}`); return r; };
  const audits = async () => (await db.select().from(s.auditEvents)).filter((e) => e.entity === "external_commitment");

  // A real class gives a teacher and an exact interval to clash with.
  const portal = await data.getPortalData();
  const meeting = portal.meetings.find((m) => m.teachers.length && m.rooms.length)!;
  const teacher = meeting.teachers[0];
  const base = { counterpartDepartment: "Synthetic EEE", dayOfWeek: meeting.dayOfWeek, startTime: hhmm(meeting.startMinutes), endTime: hhmm(meeting.endMinutes) };

  // AC-08: permission before anything else; nothing written.
  signInAs(TEACHER);
  for (const attempt of [() => od.createExternalAction(form({ ...base, kind: "teaching", teacherId: teacher.id }), token), () => od.archiveExternalAction(1, form({ revision: 1, reason: "x" }), token)])
    assert.equal(kind(await noWrite(attempt)), "permission");
  signInAs(null);
  assert.equal(kind(await noWrite(() => od.createExternalAction(form({ ...base, kind: "teaching", teacherId: teacher.id }), token))), "permission");
  signInAs(ADMIN);
  lines.push("A teacher and an anonymous request are refused before any write; nothing is stored or audited.");

  // AC-02: per-choice validation writes nothing.
  assert.equal(kind(await noWrite(() => od.createExternalAction(form({ ...base, kind: "teaching" }), token))), "validation");
  assert.equal(kind(await noWrite(() => od.createExternalAction(form({ kind: "unresolved_note", counterpartDepartment: "Synthetic" }), token))), "validation");

  // Create a teaching commitment clashing with the class; the engine reports exactly that clash.
  const created = ok(await od.createExternalAction(form({ ...base, kind: "teaching", teacherId: teacher.id, roomId: meeting.rooms[0].id, courseLabel: "SYN-EEE" }), token));
  const id = (created.outcome as { entityId: number }).entityId;
  let current = await row(id);
  assert.deepEqual([current.kind, current.roomId, current.completenessLevel, current.verificationStatus, current.revision], ["teaching", null, "B", "pending", 1], "teaching stores no room; level B; pending");
  const clashes = async () => { const p = await data.getPortalData(); return analyzeSchedule({ meetings: p.meetings, externals: p.externals, breaks: [], windows: [] }).filter((i) => i.id === `etc-${id}-${meeting.id}`).length; };
  assert.equal(await clashes(), 1);

  // A note fabricates nothing even when other fields are posted.
  const note = ok(await od.createExternalAction(form({ ...base, kind: "unresolved_note", teacherId: teacher.id, roomId: meeting.rooms[0].id, notes: "Synthetic unknown" }), token));
  const noteId = (note.outcome as { entityId: number }).entityId;
  const noteRow = await row(noteId);
  assert.deepEqual([noteRow.teacherId, noteRow.roomId, noteRow.dayOfWeek, noteRow.startMinutes, noteRow.completenessLevel], [null, null, null, null, "D"]);
  assert.equal(kind(await noWrite(() => od.verifyExternalAction(noteId, form({ revision: 1, note: "Synthetic" }), token))), "validation", "a note cannot be verified");
  lines.push("Choices store only their facts: teaching stores no room (level B), an unresolved note stores no teacher, room, day or time (level D) and cannot be verified; the conflict engine reports the new teacher clash.");

  // Verify needs a note; stale revisions are refused without writing.
  assert.equal(kind(await noWrite(() => od.verifyExternalAction(id, form({ revision: 1, note: " " }), token))), "validation");
  ok(await od.verifyExternalAction(id, form({ revision: 1, note: "Synthetic confirmation" }), token));
  current = await row(id);
  assert.deepEqual([current.verificationStatus, current.verificationNote, current.revision], ["verified", "Synthetic confirmation", 2]);
  assert.equal(kind(await noWrite(() => od.editExternalAction(id, form({ ...base, kind: "teaching", teacherId: teacher.id, revision: 1 }), token))), "stale");

  // A non-planning edit keeps Verified; a planning edit returns to Pending; level follows the facts.
  ok(await od.editExternalAction(id, form({ ...base, kind: "teaching", teacherId: teacher.id, courseLabel: "SYN-EEE", audienceLabel: "Synthetic year 1", revision: 2 }), token));
  assert.equal((await row(id)).verificationStatus, "verified");
  const later = Math.min(meeting.endMinutes + 30, 23 * 60 + 59);
  const edited = ok(await od.editExternalAction(id, form({ ...base, endTime: hhmm(later), kind: "teaching", teacherId: teacher.id, courseLabel: "SYN-EEE", audienceLabel: "Synthetic year 1", credits: "3.0", revision: 3 }), token));
  assert.match(edited.message, /returned to Pending/);
  current = await row(id);
  assert.deepEqual([current.verificationStatus, current.completenessLevel, current.endMinutes, current.revision], ["pending", "A", later, 4]);
  const editEvent = (await audits()).filter((e) => e.entityId === id && e.action === "external.edit").at(-1)!;
  assert.deepEqual((editEvent.detail as { changed: string[]; returnedToPending: boolean }), { changed: ["endMinutes", "credits"], returnedToPending: true });
  lines.push("Verify requires a confirmation note; an edit carrying an old revision is refused without a write; a label-only edit keeps Verified, while changing the time returns it to Pending and adding credits raises it to level A.");

  // Two simultaneous edits of the same revision: exactly one commits.
  const race = await Promise.all([4, 4].map((revision, i) => od.editExternalAction(id, form({ ...base, endTime: hhmm(later), kind: "teaching", teacherId: teacher.id, courseLabel: `SYN-EEE-${i}`, audienceLabel: "Synthetic year 1", credits: "3.0", revision }), token)));
  assert.deepEqual(race.map(kind).sort(), ["stale", "success"]);

  // AC-06: archive removes the record from planning; workload and publications are not touched.
  const allocationsBefore = JSON.stringify(await db.select().from(s.workloadAllocations).orderBy(asc(s.workloadAllocations.id)));
  const versionsBefore = JSON.stringify(await db.select().from(s.scheduleVersions).orderBy(asc(s.scheduleVersions.id)));
  assert.equal(kind(await noWrite(() => od.archiveExternalAction(id, form({ revision: 5, reason: "" }), token))), "validation");
  ok(await od.archiveExternalAction(id, form({ revision: 5, reason: "Synthetic arrangement ended" }), token));
  current = await row(id);
  assert.deepEqual([current.lifecycleStatus, current.archiveReason, current.archivedAt != null], ["archived", "Synthetic arrangement ended", true]);
  assert.equal(await clashes(), 0, "an archived record produces no conflict");
  const afterArchive = await data.getPortalData();
  assert.ok(!afterArchive.externals.some((e) => e.id === id), "an archived record leaves the OD row, publications and the teacher routine source");
  assert.equal(kind(await noWrite(() => od.editExternalAction(id, form({ ...base, kind: "teaching", teacherId: teacher.id, revision: 6 }), token))), "validation", "archived records are not edited");

  // The fixture commitment counted by workload can be archived; workload is disclosed and unchanged.
  const [counted] = await db.select().from(s.externalCommitments).where(eq(s.externalCommitments.termId, token.activeTermId!)).orderBy(asc(s.externalCommitments.id));
  const archivedCounted = ok(await od.archiveExternalAction(counted.id, form({ revision: counted.revision, reason: "Synthetic ended" }), token));
  assert.match(archivedCounted.message, /Workload still counts it/);
  assert.equal(JSON.stringify(await db.select().from(s.workloadAllocations).orderBy(asc(s.workloadAllocations.id))), allocationsBefore);
  assert.equal(JSON.stringify(await db.select().from(s.scheduleVersions).orderBy(asc(s.scheduleVersions.id))), versionsBefore);
  lines.push("Archive needs a reason, removes the record from conflicts, planning data and the teacher routine, refuses later edits, and leaves workload allocations and published versions unchanged while disclosing the counted workload.");

  // Reactivate returns as Pending; the register projection agrees.
  ok(await od.reactivateExternalAction(id, form({ revision: 6, reason: "Synthetic resumed" }), token));
  current = await row(id);
  assert.deepEqual([current.lifecycleStatus, current.archivedAt, current.archiveReason, current.verificationStatus, current.revision], ["active", null, null, "pending", 7]);
  assert.equal(await clashes(), 1, "reactivated, it blocks the teacher again");
  const workspace = await reads.getCommitmentWorkspace();
  assert.equal(workspace.rows.find((r) => r.id === id)?.lifecycleStatus, "active");
  assert.equal(workspace.rows.find((r) => r.id === counted.id)?.workload.length, 1);

  // Resolve the note into a structured record that keeps the original text.
  ok(await od.editExternalAction(noteId, form({ ...base, kind: "room_reservation", roomId: meeting.rooms[0].id, notes: "Resolved by phone", revision: 1 }), token));
  const resolved = await row(noteId);
  assert.deepEqual([resolved.kind, resolved.completenessLevel, resolved.verificationStatus], ["room_reservation", "C", "pending"]);
  assert.match(resolved.notes!, /Original note: Synthetic unknown/);

  // AC-07: one audit event per successful action, none for refusals; history reads them newest first.
  const events = (await audits()).filter((e) => e.entityId === id).map((e) => e.action);
  assert.deepEqual(events, ["external.create", "external.verify", "external.edit", "external.edit", "external.edit", "external.archive", "external.reactivate"]);
  assert.deepEqual((await audits()).filter((e) => e.entityId === noteId).map((e) => e.action), ["external.create", "external.resolve"]);
  const history = await reads.getCommitmentHistory(id);
  assert.deepEqual(history!.events.map((e) => e.label), ["Reactivated", "Archived", "Edited", "Edited", "Edited", "Verified", "Created"]);
  assert.equal(history!.events[1].reason, "Synthetic arrangement ended");
  assert.equal(history!.events[5].note, "Synthetic confirmation");

  // Hard delete of a mistaken entry still works (BUG-27 guard unchanged).
  ok(await actions.deleteExternalAction(noteId, token));
  lines.push("Reactivate returns an archived record as Pending; a resolved note keeps its original text; each success writes exactly one named audit event and refusals write none; history lists them newest first with reasons and notes; delete of a mistaken entry still works.");

  const { civilDate, civilDay, firstWeekday } = loadApp<typeof import("../../../src/lib/room-maintenance")>("src/lib/room-maintenance.ts");
  const linkable = portal.meetings.find((m) => m.deliveryMode === "fixed" && !m.pendingReconciliation && m.teachers.length)!;
  assert.ok(linkable);
  const date = civilDate(firstWeekday(civilDay(portal.term.startDate)!, civilDay(portal.term.endDate)!, [linkable.dayOfWeek])!);
  const dated = { kind: "teaching", counterpartDepartment: "Synthetic cross-department class", teacherId: linkable.teachers[0].id,
    dayOfWeek: linkable.dayOfWeek, startTime: hhmm(linkable.startMinutes), endTime: hhmm(linkable.endMinutes), effectiveFrom: date, effectiveTo: date };
  assert.equal(kind(await noWrite(() => od.createExternalAction(form({ ...dated, effectiveTo: "" }), token))), "validation");
  const datedId = (ok(await od.createExternalAction(form(dated), token)).outcome as { entityId: number }).entityId;
  assert.deepEqual([(await row(datedId)).effectiveFrom, (await row(datedId)).effectiveTo], [date, date]);
  const link = { groupId: linkable.teachingGroupId, revision: 1, reason: "Confirmed same class with counterpart" };
  signInAs(TEACHER);
  assert.equal(kind(await noWrite(() => od.setExternalLinkAction(datedId, form(link), token))), "permission");
  signInAs(ADMIN);
  assert.equal(kind(await noWrite(() => od.setExternalLinkAction(datedId, form({ ...link, groupId: 999999 }), token))), "stale");
  ok(await od.setExternalLinkAction(datedId, form(link), token));
  assert.ok((await data.getPortalData()).coveredCommitmentIds?.includes(datedId));
  assert.ok(!(await data.getPortalData()).externals.some((e) => e.id === datedId));
  await db.update(s.meetings).set({ effectiveFrom: civilDate(civilDay(date)! + 1) }).where(eq(s.meetings.id, linkable.id));
  const drifted = await data.getPortalData();
  assert.equal(drifted.externals.find((e) => e.id === datedId)?.linkNeedsReview, true);
  assert.ok(analyzeSchedule({ meetings: drifted.meetings, externals: drifted.externals, breaks: [], windows: [], maintenance: drifted.maintenance }).some((issue) => issue.type === "external_link_review"));
  const latest = drifted.versions.reduce<number | null>((id, version) => Math.max(id ?? 0, version.id), null);
  const blocked = await actions.publishAction("Synthetic coverage drift", token, latest);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.issues?.some((issue) => "type" in issue && issue.type === "external_link_review"));
  ok(await od.setExternalLinkAction(datedId, form({ groupId: "", revision: 2, reason: "Meeting schedule changed" }), token));
  assert.equal((await row(datedId)).linkedTeachingGroupId, null);
  assert.equal((await reads.getCommitmentHistory(datedId))?.events[0].label, "Teaching group link removed");
  lines.push("Dated input is validated and saved. Linking suppresses the duplicate, a loss of coverage restores it and raises a blocker, and audited unlink clears the relationship. Unauthorized and mismatched link requests write nothing.");

  report({ lines });
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
