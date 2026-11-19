/** CAL-01 real calendar actions, loaders, pages and term-edit guard with controlled request/session boundaries. */
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { loadApp, report, signInAs } from "./controlled-runtime";
import { fingerprintDatabase } from "../fingerprint";
import { setAuditInsertFault } from "../faults";
import type { CalendarResult } from "../../../src/lib/calendar-store";
const { db } = loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const s = loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const actions = loadApp<typeof import("../../../src/lib/calendar-actions")>("src/lib/calendar-actions.ts");
const data = loadApp<typeof import("../../../src/lib/calendar-data")>("src/lib/calendar-data.ts");
const terms = loadApp<typeof import("../../../src/lib/term-actions")>("src/lib/term-actions.ts");
const calendarPage = loadApp<typeof import("../../../src/app/(portal)/terms/[id]/calendar/page")>("src/app/(portal)/terms/[id]/calendar/page.tsx");
const printPage = loadApp<typeof import("../../../src/app/(portal)/terms/[id]/calendar/print/page")>("src/app/(portal)/terms/[id]/calendar/print/page.tsx");
const client = (db as unknown as { $client: import("../database").Queryable }).$client;

const form = (values: Record<string, unknown>) => { const f = new FormData(); for (const [key, value] of Object.entries(values)) if (value !== undefined) f.set(key, String(value)); return f; };
const call = (values: Record<string, unknown>) => actions.changeCalendarAction(null, form(values));
const ok = (result: CalendarResult) => { assert.equal(result.ok, true, result.message + JSON.stringify(result.outcome)); return result; };
const kind = (result: CalendarResult) => result.outcome?.kind;
const fields = (result: CalendarResult) => result.outcome?.kind === "validation" ? Object.keys(result.outcome.fieldErrors).sort() : [];
const noWrite = async (work: () => Promise<CalendarResult>) => { const before = await fingerprintDatabase(client); const result = await work(); assert.deepEqual(await fingerprintDatabase(client), before, result.message); return result; };
const events = async () => (await db.select().from(s.auditEvents).where(eq(s.auditEvents.entity, "term_calendar"))).length;
const OWN = ["public.term_calendars", "public.term_calendar_entries", "public.audit_events"];

async function main() {
  const lines: string[] = []; signInAs("admin@example.invalid");
  const [cse] = await db.select().from(s.departments).orderBy(s.departments.id);
  const [summer] = await db.select().from(s.academicTerms).where(eq(s.academicTerms.status, "active")); // Spring 2027 in this fixture; it overlaps Fall 2026.
  const [fall] = await db.insert(s.academicTerms).values({ name: "Fall 2026", academicYear: 2026, startDate: "2026-09-15", endDate: "2027-02-15", status: "draft", managedSetup: true }).returning();
  const view = async (termId: number) => (await data.getTermCalendar(String(termId)))!;
  const othersBefore = await fingerprintDatabase(client);

  // AC-01: existing and fresh terms start with no calendar and nothing inferred; overlapping terms stay separate.
  for (const term of [summer, fall]) { const empty = await view(term.id); assert.equal(empty.revision, 0); assert.equal(empty.teaching, null); assert.deepEqual(empty.entries, []); assert.equal(empty.canEdit, true); }
  assert.equal(await data.getTermCalendar("0"), null); assert.equal(await data.getTermCalendar("999999"), null); assert.equal(await data.getTermCalendar("1; drop"), null);
  const emptyHtml = renderToStaticMarkup(await calendarPage.default({ params: Promise.resolve({ id: String(fall.id) }), searchParams: Promise.resolve({ date: "2026-10-01" }) }));
  assert.match(emptyHtml, /Teaching dates have not been recorded\./); assert.match(emptyHtml, /No calendar entries have been recorded for this term\./);

  // AC-04: a draft can be prepared while no term is active; the calendar never changes term status.
  await db.update(s.academicTerms).set({ status: "completed" }).where(eq(s.academicTerms.id, summer.id));
  const fallTeaching = { command: "teaching", termId: fall.id, teachingStart: "2026-10-01", teachingEnd: "2027-01-20", source: "Academic office term circular 11, 1 September 2026", sourceUrl: "https://example.invalid/notice/11" };
  ok(await call({ ...fallTeaching, revision: 0 }));
  assert.equal((await db.select().from(s.academicTerms).where(eq(s.academicTerms.id, fall.id)))[0].status, "draft", "saving does not activate");
  await db.update(s.academicTerms).set({ status: "active" }).where(eq(s.academicTerms.id, summer.id));
  let fallView = await view(fall.id); assert.equal(fallView.revision, 1); assert.deepEqual(fallView.teaching, { start: "2026-10-01", end: "2027-01-20", source: fallTeaching.source, sourceUrl: fallTeaching.sourceUrl });
  assert.equal((await view(summer.id)).revision, 0, "the overlapping term's calendar is untouched");

  // AC-02: all five types, then local feedback for every bad input with no write.
  const add = async (values: Record<string, unknown>, termId = fall.id) => call({ command: "create", termId, revision: (await view(termId)).revision, source: "Synthetic approved notice", ...values });
  ok(await add({ kind: "public_holiday", title: "Victory Day", startDate: "2026-12-16", endDate: "2026-12-16" }));
  ok(await add({ kind: "university_holiday", title: "Winter break", startDate: "2026-12-24", endDate: "2027-01-02" }));
  ok(await add({ kind: "class_suspension", title: "Campus closure", startDate: "2027-02-10", endDate: "2027-02-11" }));
  ok(await add({ kind: "midterm", title: "Midterm exams", startDate: "2026-11-15", endDate: "2026-11-20", regularClasses: "continue" }));
  ok(await add({ kind: "final", title: "Final exams", startDate: "2027-01-25", endDate: "2027-02-05", regularClasses: "suspended" }));
  ok(await add({ kind: "midterm", title: "Spring midterms", startDate: "2027-03-20", endDate: "2027-03-25", regularClasses: "suspended" }, summer.id));
  fallView = await view(fall.id);
  assert.deepEqual(fallView.entries.map(entry => entry.title), ["Midterm exams", "Victory Day", "Winter break", "Final exams", "Campus closure"], "date order");
  assert.deepEqual((await view(summer.id)).entries.map(entry => entry.title), ["Spring midterms"], "terms keep separate calendars");
  assert.equal(fallView.revision, 6);
  const invalidCases: Array<[Record<string, unknown>, string[]]> = [
    [{ kind: "public_holiday", title: "Bad date", startDate: "2026-02-30", endDate: "2026-12-01" }, ["startDate"]],
    [{ kind: "public_holiday", title: "Reversed", startDate: "2026-12-10", endDate: "2026-12-01" }, ["endDate"]],
    [{ kind: "public_holiday", title: "Outside", startDate: "2026-09-01", endDate: "2027-03-01" }, ["endDate", "startDate"]],
    [{ kind: "public_holiday", title: "No source", startDate: "2026-12-01", endDate: "2026-12-01", source: "" }, ["source"]],
    [{ kind: "final", title: "No effect", startDate: "2026-12-01", endDate: "2026-12-01" }, ["regularClasses"]],
    [{ kind: "public_holiday", title: "  victory   DAY ", startDate: "2026-12-16", endDate: "2026-12-16" }, ["title"]],
    [{ kind: "public_holiday", title: "Unsafe link", startDate: "2026-12-01", endDate: "2026-12-01", sourceUrl: "javascript:alert(1)" }, ["sourceUrl"]],
  ];
  for (const [values, expected] of invalidCases) { const result = await noWrite(() => add(values)); assert.equal(kind(result), "validation", JSON.stringify(values)); assert.deepEqual(fields(result), expected, JSON.stringify(values)); }
  const repeated = new FormData(); for (const [key, value] of Object.entries({ command: "create", termId: fall.id, revision: 6, kind: "public_holiday", title: "Twice", startDate: "2026-12-01", endDate: "2026-12-01", source: "S" })) repeated.set(key, String(value)); repeated.append("title", "Again");
  assert.equal(kind(await noWrite(() => actions.changeCalendarAction(null, repeated))), "validation", "repeated fields are refused");
  // The database backstops the semantic duplicate key too.
  await assert.rejects(db.insert(s.termCalendarEntries).values({ termId: fall.id, kind: "public_holiday", title: "VICTORY DAY", startDate: "2026-12-16", endDate: "2026-12-16", source: "S" }));
  await assert.rejects(db.insert(s.termCalendarEntries).values({ termId: fall.id, kind: "final", title: "No effect", startDate: "2026-12-16", endDate: "2026-12-16", source: "S" }), "exam effect is required in storage");
  await assert.rejects(db.insert(s.termCalendarEntries).values({ termId: fall.id, kind: "public_holiday", title: "Link", startDate: "2026-12-16", endDate: "2026-12-16", source: "S", sourceUrl: "javascript:x" }));
  lines.push("AC-01/AC-02: existing and new terms start empty; a sourced teaching range and all five entry types save on a draft with no active term, without changing status; overlapping terms keep separate calendars; bad, reversed, out-of-term, unsourced, missing-effect, unsafe-link, repeated-field and semantic-duplicate input is refused with field feedback and no write; storage constraints backstop duplicates, exam effect and links.");

  // AC-05: stale replay, no-op, required correction reasons and audit history.
  const midterm = fallView.entries.find(entry => entry.title === "Midterm exams")!;
  assert.equal(kind(await noWrite(() => call({ command: "create", termId: fall.id, revision: 5, kind: "public_holiday", title: "Replay", startDate: "2026-12-01", endDate: "2026-12-01", source: "S" }))), "stale", "an old revision is stale");
  assert.equal((await noWrite(() => call({ ...fallTeaching, revision: 6 }))).message, "Nothing changed.", "a no-op writes no revision or audit");
  const edit = (values: Record<string, unknown>, revision = fallView.revision) => call({ command: "update", termId: fall.id, revision, entryId: midterm.id, title: midterm.title, startDate: midterm.startDate, endDate: midterm.endDate, regularClasses: midterm.regularClasses, source: midterm.source, ...values });
  assert.equal((await noWrite(() => edit({}))).message, "Nothing changed.");
  assert.deepEqual(fields(await noWrite(() => edit({ endDate: "2026-11-21" }))), ["reason"], "a correction needs a reason");
  const beforeEvents = await events();
  ok(await edit({ endDate: "2026-11-21", kind: "final", reason: "Exam office issued a revised notice." }));
  assert.equal(await events(), beforeEvents + 1);
  assert.equal((await view(fall.id)).entries.find(entry => entry.id === midterm.id)!.kind, "midterm", "a saved entry keeps its type");
  assert.equal(kind(await noWrite(() => edit({ endDate: "2026-11-22", reason: "Second editor with an old form" }))), "stale", "the stale editor's change is refused");
  fallView = await view(fall.id);
  assert.deepEqual(fields(await noWrite(() => call({ ...fallTeaching, revision: fallView.revision, teachingEnd: "2027-01-21" }))), ["reason"]);
  ok(await call({ ...fallTeaching, revision: fallView.revision, teachingEnd: "2027-01-21", reason: "Corrected circular" }));
  fallView = await view(fall.id);
  assert.deepEqual(fields(await noWrite(() => call({ command: "teaching", termId: fall.id, revision: fallView.revision, teachingStart: "", teachingEnd: "", source: "", sourceUrl: "" }))), ["reason"], "clearing needs a reason");
  // Forged cross-term entry ids are refused.
  const summerView = await view(summer.id);
  assert.equal(kind(await noWrite(() => call({ command: "update", termId: summer.id, revision: summerView.revision, entryId: midterm.id, title: "Forged", startDate: "2027-03-01", endDate: "2027-03-01", regularClasses: "continue", source: "S", reason: "Forged" }))), "stale");
  assert.equal(kind(await noWrite(() => call({ command: "remove", termId: summer.id, revision: summerView.revision, entryId: midterm.id, reason: "Forged" }))), "stale");
  // Removal reviews the named entry and needs a reason.
  const closure = fallView.entries.find(entry => entry.title === "Campus closure")!;
  assert.deepEqual(fields(await noWrite(() => call({ command: "remove", termId: fall.id, revision: fallView.revision, entryId: closure.id }))), ["reason"]);
  ok(await call({ command: "remove", termId: fall.id, revision: fallView.revision, entryId: closure.id, reason: "Notice withdrawn" }));
  // Delete then re-add cannot make an older form current: the revision still advanced.
  ok(await add({ kind: "class_suspension", title: "Campus closure", startDate: "2027-02-10", endDate: "2027-02-11" }));
  assert.equal(kind(await noWrite(() => call({ command: "remove", termId: fall.id, revision: fallView.revision, entryId: closure.id, reason: "Old form" }))), "stale");
  // Audit failure rolls back the change.
  const faultHandle = { exec: async (q: string) => { if ("exec" in client) await (client as unknown as { exec: (q: string) => Promise<unknown> }).exec(q); else await client.query(q); } };
  await setAuditInsertFault(faultHandle, true);
  const faultBefore = (await fingerprintDatabase(client)).tables, faulted = await add({ kind: "public_holiday", title: "Fault", startDate: "2026-12-01", endDate: "2026-12-01" });
  assert.deepEqual((await fingerprintDatabase(client)).tables, faultBefore, "rolled back (sequences may advance)");
  assert.equal(faulted.ok, false); await setAuditInsertFault(faultHandle, false);
  const history = await data.getCalendarChanges(fall.id);
  assert.deepEqual(history.changes.map(change => change.action), ["term_calendar.entry.create", "term_calendar.entry.remove", "term_calendar.teaching.update", "term_calendar.entry.update", "term_calendar.entry.create", "term_calendar.entry.create", "term_calendar.entry.create", "term_calendar.entry.create", "term_calendar.entry.create", "term_calendar.teaching.set"]);
  const corrected = history.changes.find(change => change.action === "term_calendar.entry.update")!;
  assert.equal(corrected.reason, "Exam office issued a revised notice."); assert.equal((corrected.before as { endDate: string }).endDate, "2026-11-20"); assert.equal((corrected.after as { endDate: string }).endDate, "2026-11-21"); assert.equal(corrected.actor, "Synthetic Admin");
  await assert.rejects(data.getCalendarChanges(fall.id, 999999), /cursor/);
  lines.push("AC-05: old revisions (including delete/re-add and a second editor) are stale with no write; no-ops write nothing; corrections, clearing and removal require a reason; forged cross-term entry ids are refused; an injected audit failure rolls back the change; history keeps actor, time, before/after and reason.");

  // AC-04 draft date narrowing: refused while it would strand calendar dates.
  const [fallTerm] = await db.select().from(s.academicTerms).where(eq(s.academicTerms.id, fall.id));
  const termForm = (values: Record<string, string>) => form({ termId: fall.id, revision: fallTerm.revision, name: fallTerm.name, academicYear: fallTerm.academicYear, startDate: fallTerm.startDate, endDate: fallTerm.endDate, effectiveFrom: "", ...values });
  const narrowed = await noWrite(() => terms.editTermAction(null, termForm({ startDate: "2026-11-01" })));
  assert.equal(narrowed.ok, false); assert.match(JSON.stringify(narrowed.outcome), /Regular teaching dates 1 October 2026/);
  assert.equal((await noWrite(() => terms.editTermAction(null, termForm({ endDate: "2027-02-01" })))).ok, false, "the end side is protected too");
  ok(await terms.editTermAction(null, termForm({ endDate: "2027-02-28" })));
  assert.ok((await terms.editTermAction(null, form({ termId: fall.id, revision: fallTerm.revision + 1, name: fallTerm.name, academicYear: fallTerm.academicYear, startDate: fallTerm.startDate, endDate: "2027-02-15", effectiveFrom: "" }))).ok, "narrowing that strands nothing is allowed");
  lines.push("Draft term-date edits that would leave teaching dates or entries outside the term are refused on either side with no write; edits that strand nothing still save.");

  // AC-04 completed and legacy terms are read-only.
  for (const status of ["completed", "archived"]) {
    const [old] = await db.insert(s.academicTerms).values({ name: `Old ${status}`, academicYear: 2024, startDate: "2024-01-01", endDate: "2024-05-01", status }).returning();
    const oldView = await view(old.id); assert.equal(oldView.editable, false); assert.equal(oldView.canEdit, false);
    assert.equal(kind(await noWrite(() => call({ command: "create", termId: old.id, revision: 0, kind: "public_holiday", title: "Late", startDate: "2024-02-21", endDate: "2024-02-21", source: "S" }))), "conflict");
    const html = renderToStaticMarkup(await calendarPage.default({ params: Promise.resolve({ id: String(old.id) }), searchParams: Promise.resolve({}) }));
    assert.match(html, /Read-only calendar/); assert.doesNotMatch(html, /Add calendar entry|Record teaching dates/);
  }

  // AC-04 roles: global term management edits; scoped, other and expired roles only view.
  const roleCases = [["academic_administrator", null, true], ["system_administrator", cse.id, false], ["routine_coordinator", null, false], ["teacher", null, false], ["read_only_viewer", null, false], ["accounts_officer", null, false]] as const;
  for (const [index, [role, departmentId, allowed]] of roleCases.entries()) {
    const email = `calendar-role-${index}@example.invalid`;
    const [user] = await db.insert(s.portalUsers).values({ email, displayName: `Synthetic calendar role ${index}`, status: "active" }).returning();
    await db.insert(s.roleAssignments).values({ userId: user.id, role, departmentId, activeFrom: new Date("2020-01-01") }); signInAs(email);
    const visible = await view(fall.id); assert.ok(visible.entries.length >= 5, "every internal role reads the calendar"); assert.equal(visible.editor, allowed, role); assert.equal(visible.canEdit, allowed, role);
    const print = renderToStaticMarkup(await printPage.default({ params: Promise.resolve({ id: String(fall.id) }) }));
    assert.match(print, /Internal calendar copy/); assert.match(print, /Final exams/); assert.match(print, /Regular classes suspended/); assert.doesNotMatch(print, /Change history|Edit</);
    const attempt = async () => call({ command: "create", termId: fall.id, revision: (await view(fall.id)).revision, kind: "public_holiday", title: `Role ${index}`, startDate: "2026-12-01", endDate: "2026-12-01", source: "S" });
    if (allowed) {
      ok(await attempt()); assert.ok((await data.getCalendarChanges(fall.id)).changes.length);
      await db.update(s.roleAssignments).set({ activeTo: new Date(0) }).where(eq(s.roleAssignments.userId, user.id));
      await db.insert(s.roleAssignments).values({ userId: user.id, role: "read_only_viewer", departmentId: null, activeFrom: new Date("2020-01-01") });
      assert.equal(kind(await noWrite(attempt)), "permission", "an expired global assignment no longer edits");
    } else {
      assert.equal(kind(await noWrite(attempt)), "permission", role);
      await assert.rejects(data.getCalendarChanges(fall.id)); await assert.rejects(actions.loadCalendarChangesAction(fall.id, 1));
    }
  }
  signInAs(null);
  assert.equal(kind(await noWrite(() => call({ command: "create", termId: fall.id, revision: 0 }))), "permission");
  await assert.rejects(data.getTermCalendar(String(fall.id))); await assert.rejects(data.getCalendarChanges(fall.id));
  signInAs("admin@example.invalid");
  lines.push("AC-04: internal viewers read and print; only an in-force global term-management assignment edits or reads history (a CSE-scoped system administrator, other roles and an expired assignment are refused with no write); signed-out reads and writes are refused; completed and legacy-status terms are read-only.");

  // Lookup on the saved projection (AC-03) and the print matches the screen projection (AC-06).
  const page = (date: string) => calendarPage.default({ params: Promise.resolve({ id: String(fall.id) }), searchParams: Promise.resolve({ date }) }).then(renderToStaticMarkup);
  assert.match(await page("2026-12-16"), /Regular classes suspended/);
  assert.match(await page("2026-11-16"), /Within regular teaching dates/);
  assert.match(await page("2026-09-20"), /Outside regular teaching dates/);
  assert.match(await page("2026-09-01"), /Outside term dates/);
  assert.match(await page("2026-13-40"), /Enter a real date/);
  const screenTitles = (await view(fall.id)).entries.map(entry => entry.title), print = renderToStaticMarkup(await printPage.default({ params: Promise.resolve({ id: String(fall.id) }) }));
  let at = -1; for (const title of screenTitles) { const next = print.indexOf(`<strong>${title}</strong>`); assert.ok(next > at, `print keeps screen order for ${title}`); at = next; }
  assert.match(print, /example\.invalid\/notice\/11/); assert.doesNotMatch(print, /javascript:/);
  lines.push("AC-03/AC-06: the saved calendar's lookup reports suspended, teaching, outside-teaching, outside-term and invalid-date states; the A4 print lists every saved entry in the screen's order with its effect and source, without edit controls or history.");

  // Only the calendar's own tables and audit changed.
  const othersAfter = await fingerprintDatabase(client);
  for (const [name, value] of Object.entries(othersBefore.tables)) if (![...OWN, "public.academic_terms", "public.portal_users", "public.role_assignments"].includes(name)) assert.deepEqual(othersAfter.tables[name], value, name);
  lines.push("No table outside the calendar, its audit, the synthetic terms and role fixtures changed (attendance, routines, publications and snapshots identical).");
  report({ lines });
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
