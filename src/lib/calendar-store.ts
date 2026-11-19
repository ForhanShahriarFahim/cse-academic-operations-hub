/** CAL-01 injected term-calendar reads and writes; no configured client import. */
import { and, asc, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { academicTerms, auditEvents, termCalendarEntries, termCalendars } from "@/db/schema";
import { hasCapability, type Actor } from "./auth/policy";
import { conflicted, denied, invalid, stale, succeeded, type ActionResult } from "./action-result";
import { calendarEditable, calendarReason, isExamKind, kindLabel, dateRange, parseEntry, parseTeaching, sameEntryIdentity, sortEntries, strandedByTermDates, type CalendarEntry, type CalendarTerm, type EntryFields, type TeachingRange } from "./calendar-records";
import { lockTermContext } from "./term-lock";

export type CalendarTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type CalendarReader = Pick<CalendarTx, "select">;

export interface TermCalendarView {
  term: CalendarTerm;
  /** 0 until the first save; every committed change increases it. */
  revision: number;
  teaching: TeachingRange | null;
  entries: CalendarEntry[];
  editable: boolean;
}
export interface CalendarResult extends ActionResult { revision?: number }

const integer = (value: unknown) => typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value.trim()) && Number(value) <= 2147483647 ? Number(value) : null;
const revisionOf = (value: unknown) => typeof value === "string" && /^(0|[1-9][0-9]{0,9})$/.test(value.trim()) ? Number(value) : null;
export const calendarInteger = integer;

function teachingOf(row: typeof termCalendars.$inferSelect | undefined): TeachingRange | null {
  return row?.teachingStart && row.teachingEnd && row.teachingSource ? { start: row.teachingStart, end: row.teachingEnd, source: row.teachingSource, sourceUrl: row.teachingSourceUrl } : null;
}
const entryOf = (row: typeof termCalendarEntries.$inferSelect): CalendarEntry => ({ id: row.id, kind: row.kind, title: row.title, startDate: row.startDate, endDate: row.endDate, regularClasses: row.regularClasses, source: row.source, sourceUrl: row.sourceUrl });

/**
 * One consistent projection of a term's calendar. Every writer bumps the
 * calendar revision in the same commit, so an unchanged revision around the
 * entry read proves the parts belong together.
 */
export async function readTermCalendar(reader: CalendarReader, termId: number): Promise<TermCalendarView | null> {
  const [term] = await reader.select({ id: academicTerms.id, name: academicTerms.name, status: academicTerms.status, startDate: academicTerms.startDate, endDate: academicTerms.endDate }).from(academicTerms).where(eq(academicTerms.id, termId));
  if (!term) return null;
  for (let attempt = 0; ; attempt++) {
    const [calendar] = await reader.select().from(termCalendars).where(eq(termCalendars.termId, termId));
    const rows = calendar ? await reader.select().from(termCalendarEntries).where(eq(termCalendarEntries.termId, termId)).orderBy(asc(termCalendarEntries.startDate), asc(termCalendarEntries.id)) : [];
    const [check] = await reader.select({ revision: termCalendars.revision }).from(termCalendars).where(eq(termCalendars.termId, termId));
    if ((check?.revision ?? 0) === (calendar?.revision ?? 0) || attempt >= 4) {
      return { term, revision: calendar?.revision ?? 0, teaching: teachingOf(calendar), entries: sortEntries(rows.map(entryOf)), editable: calendarEditable(term.status) };
    }
  }
}

const STALE = "The calendar changed since you opened it. Your entries are kept and nothing was saved. Reload the calendar to see the current version.";
const audit = (tx: CalendarTx, actor: Actor, action: string, termId: number, before: unknown, after: unknown, detail: Record<string, unknown>) =>
  tx.insert(auditEvents).values({ actor: actor.displayName, actorUserId: actor.id, actorDisplayName: actor.displayName, actorKind: "user", action, entity: "term_calendar", entityId: termId, before, after, detail });

/** Creates the calendar row on first save, otherwise advances its revision. */
async function advance(tx: CalendarTx, termId: number, exists: boolean, teaching?: TeachingRange | null) {
  const values = teaching === undefined ? {} : { teachingStart: teaching?.start ?? null, teachingEnd: teaching?.end ?? null, teachingSource: teaching?.source ?? null, teachingSourceUrl: teaching?.sourceUrl ?? null };
  const [row] = exists
    ? await tx.update(termCalendars).set({ ...values, revision: sql`${termCalendars.revision} + 1`, updatedAt: new Date() }).where(eq(termCalendars.termId, termId)).returning({ revision: termCalendars.revision })
    : await tx.insert(termCalendars).values({ termId, ...values }).returning({ revision: termCalendars.revision });
  return row.revision;
}
const sameTeaching = (a: TeachingRange | null, b: TeachingRange | null) => a === b || !!a && !!b && a.start === b.start && a.end === b.end && a.source === b.source && a.sourceUrl === b.sourceUrl;
const sameEntry = (a: CalendarEntry, b: EntryFields) => a.kind === b.kind && a.title === b.title && a.startDate === b.startDate && a.endDate === b.endDate && a.regularClasses === b.regularClasses && a.source === b.source && a.sourceUrl === b.sourceUrl;
const reasonErrors = { reason: ["Enter a correction reason of up to 300 plain-text characters."] };

/**
 * Every calendar write: global `manage_terms`, the shared term-context lock,
 * then the term row lock; identity, status and revision are decided under
 * those locks and the change and its audit event commit together.
 */
export async function changeCalendarInTransaction(tx: CalendarTx, actor: Actor, raw: Record<string, unknown>): Promise<CalendarResult> {
  if (!hasCapability(actor, "manage_terms", null)) return denied("Changing a term calendar needs a university-wide term management role.", "forbidden");
  await lockTermContext(tx, "share");
  const command = raw.command;
  if (command !== "teaching" && command !== "create" && command !== "update" && command !== "remove") return invalid("Choose a supported calendar action.");
  const termId = integer(raw.termId), revision = revisionOf(raw.revision);
  if (!termId || revision == null) return invalid("This calendar form is incomplete. Reload the calendar and try again.");
  const [term] = await tx.select().from(academicTerms).where(eq(academicTerms.id, termId)).for("update");
  if (!term) return stale("This academic term no longer exists.", "missing");
  if (!calendarEditable(term.status)) return conflicted("This term's calendar is read-only.", [{ severity: "blocker", title: "Term is not draft or active", detail: `${term.name} is ${term.status}. Its calendar is kept as recorded and cannot be changed.` }]);
  const view = (await readTermCalendar(tx, termId))!;
  if (revision !== view.revision) return { ...stale(STALE), revision: view.revision };
  const exists = view.revision > 0;
  const reason = calendarReason(raw.reason);
  if (reason === undefined) return invalid("Check the reason.", reasonErrors);

  if (command === "teaching") {
    const parsed = parseTeaching(raw, view.term);
    if (!parsed.ok) return invalid("Check the highlighted teaching dates.", parsed.errors);
    if (sameTeaching(parsed.range, view.teaching)) return succeeded("Nothing changed.", { entityId: termId });
    if (view.teaching && !reason) return invalid(parsed.range ? "Enter a reason for correcting the teaching dates." : "Enter a reason for clearing the teaching dates.", reasonErrors);
    const next = await advance(tx, termId, exists, parsed.range);
    const action = !parsed.range ? "term_calendar.teaching.clear" : view.teaching ? "term_calendar.teaching.update" : "term_calendar.teaching.set";
    await audit(tx, actor, action, termId, view.teaching, parsed.range, { term: term.name, reason });
    return { ...succeeded(parsed.range ? `Regular teaching dates saved: ${dateRange(parsed.range.start, parsed.range.end)}.` : "Regular teaching dates cleared. The calendar now shows them as not recorded.", { entityId: termId }), revision: next };
  }

  let current: CalendarEntry | null = null;
  if (command !== "create") {
    const entryId = integer(raw.entryId);
    if (!entryId) return invalid("This calendar entry is not valid. Reload the calendar.");
    const [row] = await tx.select().from(termCalendarEntries).where(and(eq(termCalendarEntries.id, entryId), eq(termCalendarEntries.termId, termId)));
    if (!row) return stale("This calendar entry is no longer in this term's calendar.", "missing");
    current = entryOf(row);
  }

  if (command === "remove") {
    if (!reason) return invalid("Enter a reason for removing this entry.", reasonErrors);
    await tx.delete(termCalendarEntries).where(and(eq(termCalendarEntries.id, current!.id), eq(termCalendarEntries.termId, termId)));
    const next = await advance(tx, termId, true);
    await audit(tx, actor, "term_calendar.entry.remove", termId, current, null, { term: term.name, entryId: current!.id, title: current!.title, reason });
    return { ...succeeded(`${kindLabel(current!.kind)} “${current!.title}” was removed from the calendar.`, { entityId: termId }), revision: next };
  }

  // The type of a saved entry is fixed; a different type is a different notice.
  const parsed = parseEntry(raw, view.term, current?.kind);
  if (!parsed.ok) return invalid("Check the highlighted fields.", parsed.errors);
  const entry = parsed.entry;
  if (view.entries.some(other => other.id !== current?.id && sameEntryIdentity(other, entry))) return invalid("This entry is already in the calendar.", { title: [`A ${kindLabel(entry.kind).toLowerCase()} with this title and these dates is already recorded. Edit that entry to change its source${isExamKind(entry.kind) ? " or effect" : ""}.`] });
  if (current) {
    if (sameEntry(current, entry)) return succeeded("Nothing changed.", { entityId: termId });
    if (!reason) return invalid("Enter a reason for correcting this entry.", reasonErrors);
    await tx.update(termCalendarEntries).set({ ...entry, updatedAt: new Date() }).where(and(eq(termCalendarEntries.id, current.id), eq(termCalendarEntries.termId, termId)));
    const next = await advance(tx, termId, true);
    await audit(tx, actor, "term_calendar.entry.update", termId, current, { id: current.id, ...entry }, { term: term.name, entryId: current.id, title: entry.title, reason });
    return { ...succeeded(`${kindLabel(entry.kind)} “${entry.title}” saved.`, { entityId: termId }), revision: next };
  }
  // Insert the calendar row first so the entry's foreign key holds.
  const next = await advance(tx, termId, exists);
  const [row] = await tx.insert(termCalendarEntries).values({ termId, ...entry }).returning();
  await audit(tx, actor, "term_calendar.entry.create", termId, null, entryOf(row), { term: term.name, entryId: row.id, title: entry.title, reason });
  return { ...succeeded(`${kindLabel(entry.kind)} “${entry.title}” added for ${dateRange(entry.startDate, entry.endDate)}.`, { entityId: termId }), revision: next };
}

/** Calendar dates a proposed draft term-date edit would leave outside the term. */
export async function calendarDatesOutside(reader: CalendarReader, termId: number, startDate: string, endDate: string) {
  const view = await readTermCalendar(reader, termId);
  if (!view) return [];
  return strandedByTermDates(startDate, endDate, view.teaching, view.entries);
}
