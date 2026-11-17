/** Real term-offering actions/authorization/loaders with controlled request/session boundaries. */
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { loadApp, report, signInAs } from "./controlled-runtime";
import { fingerprintDatabase, selectFingerprint } from "../fingerprint";
import { setAuditInsertFault } from "../faults";
import type { OfferingResult } from "../../../src/lib/offering-store";
import { renderToStaticMarkup } from "react-dom/server";
const { db } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const actions = loadApp<typeof import("../../../src/lib/offering-actions")>("src/lib/offering-actions.ts");
const data = loadApp<typeof import("../../../src/lib/offering-data")>("src/lib/offering-data.ts");
const context = loadApp<typeof import("../../../src/lib/term-context")>("src/lib/term-context.ts");
const listPage = loadApp<typeof import("../../../src/app/(portal)/terms/[id]/offerings/page")>("src/app/(portal)/terms/[id]/offerings/page.tsx");
const client = (db as unknown as { $client: import("../database").Queryable }).$client;
const form = (values: Record<string, unknown>, picks: string[] = []) => { const f = new FormData(); for (const [key, value] of Object.entries(values)) f.set(key, String(value)); for (const pick of picks) f.append("pick", pick); return f; };
const call = (values: Record<string, unknown>, picks: string[] = []) => actions.changeOfferingsAction(null, form(values, picks));
const ok = (result: OfferingResult) => { assert.equal(result.ok, true, result.message); return result; };
const kind = (result: OfferingResult) => result.outcome?.kind;
const noWrite = async (work: () => Promise<OfferingResult>) => { const before = await fingerprintDatabase(client); const result = await work(); assert.deepEqual(await fingerprintDatabase(client), before, result.message); return result; };
const events = async () => (await db.select().from(s.auditEvents).where(eq(s.auditEvents.entity, "term_offerings"))).length;

async function main() {
  const lines: string[] = []; signInAs("admin@example.invalid");
  const [cse, eee] = await db.select().from(s.departments).orderBy(s.departments.id);
  const [summer] = await db.select().from(s.academicTerms);
  const [admin] = await db.select().from(s.portalUsers).where(eq(s.portalUsers.email, "admin@example.invalid"));
  const batch = async (stream: string, label: string) => (await db.select().from(s.batches).where(and(eq(s.batches.stream, stream), eq(s.batches.label, label))))[0];
  const hsc22b = await batch("HSC", "22B"), dip22b = await batch("DIPLOMA", "22B"), hsc21b = await batch("HSC", "21B");
  const [theory, sessional] = await db.select().from(s.courses).orderBy(s.courses.id);
  // Synthetic setup: a second source cohort in the HSC semester-7 slot, extra catalog courses, a completed older term and a prepared draft.
  const [extra, retired, later] = await db.insert(s.courses).values([
    { code: "SYN-4103", title: "Synthetic Elective", credits: "3.0", semester: 7 },
    { code: "SYN-4104", title: "Synthetic Retired", credits: "3.0", semester: 7, isActive: false },
    { code: "SYN-4201", title: "Synthetic Later Course", credits: "3.0", semester: 8 },
  ]).returning();
  const [hsc22c, hsc23x] = await db.insert(s.batches).values([{ stream: "HSC", label: "22C", sortOrder: 3 }, { stream: "HSC", label: "23X", sortOrder: 4 }]).returning();
  await db.insert(s.batchTermPlacements).values({ batchId: hsc22c.id, termId: summer.id, semester: 7 });
  await db.insert(s.courseOfferings).values([
    { termId: summer.id, batchId: hsc22c.id, courseId: theory.id }, { termId: summer.id, batchId: hsc22c.id, courseId: extra.id },
    { termId: summer.id, batchId: hsc22c.id, courseId: retired.id }, { termId: summer.id, batchId: hsc22b.id, courseId: retired.id },
    { termId: summer.id, batchId: hsc22c.id, courseId: later.id, status: "cancelled" },
  ]);
  const [spring, fall] = await db.insert(s.academicTerms).values([
    { name: "Spring 2026", academicYear: 2026, startDate: "2026-01-01", endDate: "2026-05-01", status: "completed" },
    { name: "Fall 2026", academicYear: 2026, startDate: "2026-10-15", endDate: "2027-02-15", status: "draft" },
  ]).returning();
  await db.insert(s.batchTermPlacements).values([
    { batchId: hsc23x.id, termId: fall.id, semester: 7 }, { batchId: hsc22b.id, termId: fall.id, semester: 8 }, { batchId: dip22b.id, termId: fall.id, semester: 4 },
  ]);
  const start = (values: Record<string, unknown>, picks: string[]) => call({ command: "start", termId: fall.id, sourceId: summer.id, reason: "Synthetic preparation", ...values }, picks);
  const view = async (termId = fall.id, sourceId: number | null = summer.id) => (await data.getTermOfferings(String(termId), sourceId ? String(sourceId) : undefined))!;
  const cohort = async (batchId: number, termId = fall.id, sourceId: number | null = summer.id) => (await view(termId, sourceId)).cohorts.find(item => item.batchId === batchId)!;
  const add = async (batchId: number, courseId: number, changes: Record<string, unknown> = {}, termId = fall.id) => call({ command: "add", termId, batchId, courseId, fingerprint: (await cohort(batchId, termId)).fingerprint, ...changes });
  const change = async (command: string, offeringId: number, batchId: number, changes: Record<string, unknown> = {}, termId = fall.id) => call({ command, termId, offeringId, fingerprint: (await cohort(batchId, termId)).fingerprint, reason: "Synthetic change", ...changes });
  const row = async (batchId: number, courseId: number, termId = fall.id) => (await db.select().from(s.courseOfferings).where(and(eq(s.courseOfferings.termId, termId), eq(s.courseOfferings.batchId, batchId), eq(s.courseOfferings.courseId, courseId))))[0];

  // AC-01 permissions.
  for (const [index, role, departmentId, allowed] of [[0, "academic_administrator", null, true], [1, "system_administrator", cse.id, true], [2, "academic_administrator", eee.id, false], [3, "routine_coordinator", null, false], [4, "teacher", null, false], [5, "read_only_viewer", null, false]] as const) {
    const email = `offering-role-${index}@example.invalid`;
    const [user] = await db.insert(s.portalUsers).values({ email, displayName: `Synthetic offering role ${index}`, status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role, departmentId, activeFrom: new Date("2020-01-01") }); signInAs(email);
    // An account scoped only to another department is not an internal viewer of this portal at all.
    if (departmentId === eee.id) await assert.rejects(view());
    else { const visible = await view(); assert.equal(visible.editor, allowed); assert.equal(visible.canEdit, allowed); assert.ok(visible.cohorts.length, "viewers read the page"); assert.equal(!!visible.startFingerprint && visible.cohorts.every(item => !!item.fingerprint), allowed, "review tokens are editor-only"); }
    const attempt = () => add(hsc22b.id, later.id);
    if (allowed) {
      ok(await attempt()); assert.ok((await data.getOfferingChanges(fall.id)).changes.length);
      await db.delete(s.courseOfferings).where(eq(s.courseOfferings.id, (await row(hsc22b.id, later.id)).id));
      await db.update(s.roleAssignments).set({ activeTo: new Date(0) }).where(eq(s.roleAssignments.userId, user.id));
      // A revoked account is no longer an internal viewer at all.
      const before = await fingerprintDatabase(client); assert.equal(kind(await call({ command: "add", termId: fall.id, batchId: hsc22b.id, courseId: later.id, fingerprint: "x" })), "permission"); assert.deepEqual(await fingerprintDatabase(client), before);
    } else {
      assert.equal(kind(await noWrite(() => call({ command: "add", termId: fall.id, batchId: hsc22b.id, courseId: later.id, fingerprint: "x" }))), "permission"); await assert.rejects(data.getOfferingChanges(fall.id)); await assert.rejects(actions.loadOfferingChangesAction(fall.id, 1));
    }
  }
  signInAs(null); assert.equal(kind(await noWrite(() => call({ command: "add", termId: fall.id, batchId: hsc22b.id, courseId: later.id, fingerprint: "x" }))), "permission"); await assert.rejects(data.getTermOfferings(String(fall.id))); await assert.rejects(data.getOfferingChanges(fall.id));
  signInAs("admin@example.invalid");
  await db.delete(s.auditEvents).where(eq(s.auditEvents.entity, "term_offerings"));
  lines.push("Real entry-point permission matrix: global/CSE administrators can change offerings and read history; other-department-only administrator, coordinator, teacher, viewer, revoked and anonymous cannot mutate or load history. Non-editor internal roles still read the page with no edit capability.");

  // Baselines for AC-02 / AC-04 / AC-08.
  const generation = (await context.readTermContext()).generation;
  const baseline = await fingerprintDatabase(client);
  const summerOfferings = () => selectFingerprint(client, `select * from course_offerings where term_id = ${summer.id}`);
  const summerBefore = await summerOfferings();

  // AC-03 basis and default source.
  await db.insert(s.termRollovers).values({ sourceTermId: spring.id, targetTermId: fall.id, actorUserId: admin.id, reason: "Synthetic receipt", summary: { fingerprint: "synthetic" } as never });
  const defaulted = await view(fall.id, null); assert.equal(defaulted.source?.id, spring.id, "the term this draft was prepared from is the default source"); assert.equal(defaulted.preparedFromId, spring.id);
  assert.ok(defaulted.cohorts.every(item => !item.hasBasis && !item.proposal.length), "a source with no cohort in the slot proposes nothing");
  await db.delete(s.termRollovers).where(eq(s.termRollovers.targetTermId, fall.id));
  assert.equal((await view(fall.id, null)).source?.id, summer.id, "otherwise the latest earlier active/completed term");
  assert.equal((await view(fall.id, fall.id)).source?.id, summer.id, "a term is never its own source");
  const fresh = await cohort(hsc23x.id);
  assert.deepEqual(fresh.basisCohorts, ["HSC-22B", "HSC-22C"]);
  assert.deepEqual(fresh.proposal.map(item => [item.course.code, item.reason, item.selectable, item.ticked]), [["SYN-4101", "carried", true, true], ["SYN-4102", "partial", true, false], ["SYN-4103", "partial", true, false], ["SYN-4104", "inactive", false, false]]);
  const progressed = await cohort(hsc22b.id); assert.equal(progressed.hasBasis, true); assert.deepEqual(progressed.proposal, [], "the source cohort in this slot had no offerings");
  assert.equal((await cohort(dip22b.id)).hasBasis, false, "no Diploma cohort sat at semester 4 in the source");
  lines.push("Clone basis follows stream + curriculum semester: all-cohort courses ticked, some-cohort courses unticked, inactive courses unselectable, cancelled source offerings excluded, empty and missing slots propose nothing. Default source is the prepared-from term, else the latest earlier active/completed term.");

  // AC-04 reviewed additive start.
  const reviewed = (await view()).startFingerprint, picks = [`${hsc23x.id}:${theory.id}`, `${hsc23x.id}:${extra.id}`];
  assert.equal(kind(await noWrite(() => start({ fingerprint: "stale" }, picks))), "stale");
  assert.equal(kind(await noWrite(() => start({ fingerprint: reviewed }, []))), "validation");
  assert.equal(kind(await noWrite(() => start({ fingerprint: reviewed, reason: "" }, picks))), "validation");
  assert.equal(kind(await noWrite(() => start({ fingerprint: reviewed }, [`${hsc23x.id}:${retired.id}`]))), "validation", "inactive course cannot be ticked by a forged form");
  assert.equal(kind(await noWrite(() => start({ fingerprint: reviewed }, [`${hsc21b.id}:${theory.id}`]))), "validation", "unplaced cohort");
  assert.equal(kind(await noWrite(() => start({ fingerprint: reviewed }, [`${dip22b.id}:${theory.id}`]))), "validation", "course outside the cohort's basis");
  assert.equal(kind(await noWrite(() => start({ fingerprint: reviewed, sourceId: fall.id }, picks))), "validation");
  assert.equal(kind(await noWrite(() => start({ fingerprint: reviewed }, ["1:2:3"]))), "validation");
  // The source changing after review forces another review.
  const [drift] = await db.insert(s.courseOfferings).values({ termId: summer.id, batchId: hsc22c.id, courseId: sessional.id }).returning();
  const drifted = await start({ fingerprint: reviewed }, picks); assert.equal(kind(drifted), "stale"); assert.notEqual(drifted.fingerprint, reviewed);
  await db.delete(s.courseOfferings).where(eq(s.courseOfferings.id, drift.id));
  ok(await start({ fingerprint: reviewed }, [...picks, picks[0]]));
  const created = await db.select().from(s.courseOfferings).where(eq(s.courseOfferings.termId, fall.id));
  assert.deepEqual(created.map(item => [item.batchId, item.courseId, item.status]).sort(), [[hsc23x.id, theory.id, "planned"], [hsc23x.id, extra.id, "planned"]].sort());
  assert.equal(await events(), 1, "one summary event for the whole start");
  const again = await view(); assert.notEqual(again.startFingerprint, reviewed);
  assert.deepEqual((await cohort(hsc23x.id)).proposal.map(item => [item.course.code, item.reason, item.selectable]), [["SYN-4101", "existing", false], ["SYN-4102", "partial", true], ["SYN-4103", "existing", false], ["SYN-4104", "inactive", false]]);
  assert.equal(kind(await noWrite(() => start({ fingerprint: again.startFingerprint }, picks))), "validation", "rerunning creates nothing");
  assert.deepEqual(await summerOfferings(), summerBefore, "source term offerings untouched");
  lines.push("Reviewed start creates exactly the ticked, missing offerings as planned rows with one summary audit event; stale review, changed source, empty/forged/inactive/unplaced/out-of-basis ticks and a missing reason write nothing; rerunning proposes and creates nothing new; source-term offerings are unchanged.");

  // AC-05 comparison and AC-06 single changes.
  assert.deepEqual((await cohort(hsc23x.id)).counts, { offered: 2, cancelled: 0, ungrouped: 2, carried: 2, added: 0, dropped: 2, changed: 0 });
  assert.equal(kind(await noWrite(() => add(hsc23x.id, later.id))), "validation", "out-of-semester needs an explicit tick");
  assert.equal(kind(await noWrite(() => add(hsc23x.id, later.id, { acknowledge: "on" }))), "validation", "and a reason");
  ok(await add(hsc23x.id, later.id, { acknowledge: "on", reason: "Synthetic exception" }));
  ok(await add(hsc23x.id, sessional.id)); // in-semester add needs no reason
  assert.equal(kind(await noWrite(() => add(hsc23x.id, sessional.id))), "validation", "duplicate");
  assert.equal(kind(await noWrite(() => add(hsc23x.id, retired.id))), "validation", "inactive course");
  assert.equal(kind(await noWrite(() => call({ command: "add", termId: fall.id, batchId: hsc21b.id, courseId: theory.id, fingerprint: "x" }))), "validation", "cohort without a placement");
  assert.equal(kind(await noWrite(() => call({ command: "add", termId: fall.id, batchId: hsc23x.id, courseId: 2147483000, fingerprint: "x" }))), "validation");
  assert.equal(kind(await noWrite(() => call({ command: "add", termId: fall.id, batchId: hsc22b.id, courseId: later.id, fingerprint: "stale" }))), "stale");
  await db.update(s.batches).set({ status: "inactive" }).where(eq(s.batches.id, dip22b.id));
  assert.equal(kind(await noWrite(() => add(dip22b.id, theory.id, { acknowledge: "on", reason: "Synthetic" }))), "validation", "inactive cohort");
  await db.update(s.batches).set({ status: "active" }).where(eq(s.batches.id, dip22b.id));
  assert.deepEqual((await cohort(hsc23x.id)).counts, { offered: 4, cancelled: 0, ungrouped: 4, carried: 3, added: 1, dropped: 1, changed: 0 });

  const target = await row(hsc23x.id, theory.id);
  assert.equal(kind(await noWrite(() => change("cancel", target.id, hsc23x.id, { reason: "" }))), "validation");
  assert.equal(kind(await noWrite(() => change("cancel", target.id, hsc23x.id, { fingerprint: "stale" }))), "stale");
  ok(await change("cancel", target.id, hsc23x.id)); assert.equal((await row(hsc23x.id, theory.id)).status, "cancelled");
  const afterCancel = await events(); assert.equal((await noWrite(() => change("cancel", target.id, hsc23x.id))).message, "Nothing changed."); assert.equal(await events(), afterCancel);
  const cancelled = await cohort(hsc23x.id); assert.equal(cancelled.offerings.find(item => item.id === target.id)!.comparison, "changed"); assert.deepEqual(cancelled.counts, { offered: 3, cancelled: 1, ungrouped: 3, carried: 2, added: 1, dropped: 1, changed: 1 });
  // Adding a cancelled course restores the same row instead of duplicating it.
  ok(await add(hsc23x.id, theory.id)); assert.equal((await row(hsc23x.id, theory.id)).id, target.id); assert.equal((await row(hsc23x.id, theory.id)).status, "planned");
  ok(await change("cancel", target.id, hsc23x.id));
  assert.equal(kind(await noWrite(() => change("restore", target.id, hsc23x.id, { reason: " " }))), "validation");
  await db.update(s.courses).set({ isActive: false }).where(eq(s.courses.id, theory.id));
  assert.equal(kind(await noWrite(() => change("restore", target.id, hsc23x.id))), "validation", "restoring re-checks the course");
  await db.update(s.courses).set({ isActive: true }).where(eq(s.courses.id, theory.id));
  ok(await change("restore", target.id, hsc23x.id)); assert.equal((await noWrite(() => change("restore", target.id, hsc23x.id))).message, "Nothing changed.");
  const mistake = await row(hsc23x.id, later.id);
  assert.equal(kind(await noWrite(() => change("remove", mistake.id, hsc23x.id, { confirmation: "syn-4201" }))), "validation");
  assert.equal(kind(await noWrite(() => change("remove", mistake.id, hsc23x.id, { confirmation: later.code, reason: "" }))), "validation");
  ok(await change("remove", mistake.id, hsc23x.id, { confirmation: later.code })); assert.equal(await row(hsc23x.id, later.id), undefined);
  assert.equal(kind(await noWrite(() => change("cancel", mistake.id, hsc23x.id))), "stale", "removed offering is missing");
  lines.push("Comparison counts track every change (carried/added/dropped/changed). Out-of-semester adds need an explicit tick and reason; duplicates, inactive courses, unplaced/inactive cohorts, stale lists and unknown IDs are refused without writes. Cancel/restore need reasons and are no-ops when already in state; adding a cancelled course restores the same row; draft removal needs the typed code and keeps its audit event.");

  // Active term: linked offerings are left alone, new rows are open, removal is draft-only.
  const linked = await row(hsc22b.id, theory.id, summer.id);
  assert.equal(kind(await noWrite(() => change("cancel", linked.id, hsc22b.id, {}, summer.id))), "conflict");
  assert.equal(kind(await noWrite(() => change("remove", linked.id, hsc22b.id, { confirmation: theory.code }, summer.id))), "validation");
  ok(await add(hsc22b.id, extra.id, {}, summer.id)); const opened = await row(hsc22b.id, extra.id, summer.id); assert.equal(opened.status, "open");
  assert.equal(kind(await noWrite(() => change("remove", opened.id, hsc22b.id, { confirmation: extra.code }, summer.id))), "validation", "active term keeps the record");
  ok(await change("cancel", opened.id, hsc22b.id, {}, summer.id)); ok(await change("restore", opened.id, hsc22b.id, {}, summer.id)); assert.equal((await row(hsc22b.id, extra.id, summer.id)).status, "open");
  assert.equal(kind(await noWrite(() => change("cancel", opened.id, hsc23x.id))), "stale", "an offering cannot be addressed through another term");
  // Draft row linked to a class group is equally protected.
  const [group] = await db.insert(s.teachingGroups).values({ termId: fall.id, courseId: theory.id, deliveryMode: "teacher_managed" }).returning();
  const [link] = await db.insert(s.teachingGroupOfferings).values({ teachingGroupId: group.id, offeringId: target.id }).returning();
  assert.equal((await cohort(hsc23x.id)).offerings.find(item => item.id === target.id)!.groups, 1);
  assert.equal(kind(await noWrite(() => change("cancel", target.id, hsc23x.id))), "conflict"); assert.equal(kind(await noWrite(() => change("remove", target.id, hsc23x.id, { confirmation: theory.code }))), "conflict");
  await db.delete(s.teachingGroupOfferings).where(eq(s.teachingGroupOfferings.id, link.id)); await db.delete(s.teachingGroups).where(eq(s.teachingGroups.id, group.id));
  // Completed and legacy-status terms are read-only; viewing never needs the active term.
  for (const status of ["completed", "archived"]) {
    await db.update(s.academicTerms).set({ status }).where(eq(s.academicTerms.id, fall.id));
    const readOnly = await view(); assert.equal(readOnly.editable, false); assert.equal(readOnly.canEdit, false); assert.ok(readOnly.cohorts.length);
    assert.equal(kind(await noWrite(() => add(hsc23x.id, later.id, { acknowledge: "on", reason: "Synthetic" }))), "conflict");
  }
  await db.update(s.academicTerms).set({ status: "draft" }).where(eq(s.academicTerms.id, fall.id));
  assert.equal(await data.getTermOfferings("2147483000"), null); assert.equal(await data.getTermOfferings("abc"), null);
  assert.equal(kind(await noWrite(() => call({ command: "add", termId: 2147483000, batchId: hsc23x.id, courseId: later.id, fingerprint: "x" }))), "stale");
  for (const forged of [{ command: "delete-all" }, { command: "add", termId: "1e3" }, { command: "add", termId: `${fall.id} or 1=1` }]) assert.equal(kind(await noWrite(() => call({ termId: fall.id, ...forged }))), "validation");
  const repeated = form({ command: "add", termId: fall.id }); repeated.append("termId", String(summer.id)); assert.equal((await noWrite(() => actions.changeOfferingsAction(null, repeated))).ok, false);
  const file = form({ command: "add", termId: fall.id }); file.set("reason", new Blob(["bad"]), "reason.txt"); assert.equal((await noWrite(() => actions.changeOfferingsAction(null, file))).ok, false);
  const forgedExtras = await add(hsc23x.id, later.id, { acknowledge: "on", reason: "Synthetic exception", status: "completed", actorUserId: 999, groups: 0 }); ok(forgedExtras); assert.equal((await row(hsc23x.id, later.id)).status, "planned", "unrecognized fields change nothing");
  lines.push("Offerings in a class group cannot be cancelled or removed in either term; active-term rows are open and never removed; completed/legacy terms are read-only yet readable; cross-term, missing, malformed, repeated, file and unrecognized inputs change nothing beyond the validated command.");

  // AC-07 audit atomicity, AC-02/AC-08 preservation, history.
  const faultHandle = { exec: async (q: string) => { if ("exec" in client) await (client as unknown as { exec: (q: string) => Promise<unknown> }).exec(q); else await client.query(q); } };
  await db.delete(s.courseOfferings).where(eq(s.courseOfferings.id, (await row(hsc23x.id, sessional.id)).id)); // make one course proposable again
  await setAuditInsertFault(faultHandle, false); // install the idle fault trigger before the comparison baseline
  const rollbackBefore = await fingerprintDatabase(client), fp = (await view()).startFingerprint;
  await setAuditInsertFault(faultHandle, true);
  assert.equal((await start({ fingerprint: fp }, [`${hsc23x.id}:${sessional.id}`])).ok, false);
  assert.equal((await add(hsc22b.id, later.id)).ok, false); assert.equal((await change("cancel", target.id, hsc23x.id)).ok, false);
  await setAuditInsertFault(faultHandle, false);
  const rollbackAfter = await fingerprintDatabase(client); for (const [name, value] of Object.entries(rollbackBefore.tables)) assert.deepEqual(rollbackAfter.tables[name], value, name);
  assert.equal((await context.readTermContext()).generation, generation, "offering changes never advance the term generation");
  const state = (await context.readTermContext()).state; assert.equal(state.kind === "one" && state.term.id, summer.id, "active selection unchanged");
  const final = await fingerprintDatabase(client);
  for (const [name, value] of Object.entries(baseline.tables)) if (!["public.course_offerings", "public.audit_events"].includes(name)) assert.deepEqual(final.tables[name], value, name);
  const history = await data.getOfferingChanges(fall.id); assert.ok(history.changes.length >= 8); assert.doesNotMatch(JSON.stringify(history), /actorUserId|@example/);
  assert.ok(history.changes.some(event => event.action === "term_offerings.start" && event.source === "Summer 2026" && event.created.length === 2));
  assert.ok(history.changes.some(event => event.action === "offering.remove" && event.course === "SYN-4201" && event.cohort === "HSC-23X" && event.reason === "Synthetic change"));
  await assert.rejects(data.getOfferingChanges(fall.id, (await data.getOfferingChanges(summer.id)).changes[0].id), /cursor/);
  for (let index = 0; index < 11; index++) { ok(await change("cancel", target.id, hsc23x.id)); ok(await change("restore", target.id, hsc23x.id)); }
  const page = await data.getOfferingChanges(fall.id); assert.equal(page.changes.length, 20); assert.ok(page.next); const older = await actions.loadOfferingChangesAction(fall.id, page.next!); assert.ok(older.changes.length); assert.ok(!older.changes.some(event => page.changes.some(newer => newer.id === event.id)));
  lines.push("Audit failure rolls back start/add/cancel entirely. Across every operation only course_offerings and audit_events changed: groups, links, meetings, allocations, enrollments, attendance, claims, schedule versions, placements, courses, terms and the term generation/active selection are identical. Per-term history is editor-only, paged at 20 with validated cursors, and exposes no actor email or user ID.");
  // AC-05 / AC-09 server rendering of the list page for editor and viewer, draft and read-only.
  const html = async (termId: number, search: Record<string, string> = {}) => renderToStaticMarkup(await listPage.default({ params: Promise.resolve({ id: String(termId) }), searchParams: Promise.resolve(search) }));
  const editorHtml = await html(fall.id, { source: String(summer.id) });
  for (const text of ["Term offerings — Fall 2026", "HSC-23X · Semester 7", "Dropped since Summer 2026", "SYN-4104", "The course is inactive.", "Start from previous term", "Change history", "viewing it does not change the active term", "Not started", "had no Diploma cohort at semester 4"]) assert.ok(editorHtml.includes(text), text);
  assert.ok((await html(fall.id, { compare: "added", source: String(summer.id) })).includes("SYN-4201")); assert.ok(!(await html(fall.id, { compare: "added", source: String(summer.id) })).includes("Synthetic Theory"));
  assert.ok((await html(fall.id, { q: "zzz-no-match" })).includes("No offering of this cohort matches the filters."));
  signInAs("offering-role-5@example.invalid"); const viewerHtml = await html(fall.id);
  assert.ok(viewerHtml.includes("View only")); for (const text of ["Start from previous term", "Change history", "Add course", ">Change<", ">Restore<"]) assert.ok(!viewerHtml.includes(text), `viewer must not see ${text}`);
  signInAs("admin@example.invalid");
  await db.update(s.academicTerms).set({ status: "completed" }).where(eq(s.academicTerms.id, fall.id)); const readOnlyHtml = await html(fall.id); assert.ok(readOnlyHtml.includes("Read-only term")); assert.ok(!readOnlyHtml.includes("Add course"));
  await db.update(s.academicTerms).set({ status: "draft" }).where(eq(s.academicTerms.id, fall.id));
  const [empty] = await db.insert(s.academicTerms).values({ name: "Spring 2027", academicYear: 2027, startDate: "2027-03-01", endDate: "2027-06-30", status: "draft" }).returning();
  assert.ok((await html(empty.id)).includes("No cohorts placed")); await assert.rejects(html(2147483000), /not-found/);
  lines.push("Server-rendered list page: editor sees cohorts, comparison, dropped list and actions; filters narrow rows; a view-only role sees the data with no edit or history controls; completed terms render read-only; a draft without placements explains the missing step; an unknown term is not found.");
  report({ lines });
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
