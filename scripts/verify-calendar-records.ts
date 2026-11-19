/** CAL-01 database-free calendar rules (AC-02, AC-03). */
import assert from "node:assert/strict";
import { closesRegularClasses, dateRange, dhakaToday, longDate, lookupDate, parseEntry, parseTeaching, plainText, sameEntryIdentity, sortEntries, sourceUrl, strandedByTermDates, titleKey, type CalendarEntry, type CalendarTerm } from "../src/lib/calendar-records";

const term: CalendarTerm = { id: 1, name: "Spring 2027", status: "active", startDate: "2027-01-01", endDate: "2027-06-30" };
const source = "Academic office term circular, 16 December 2026";

// Teaching dates: both or neither, real dates, ordered, inside the term, with a source.
assert.deepEqual(parseTeaching({ teachingStart: "2027-01-09", teachingEnd: "2027-05-08", source }, term), { ok: true, range: { start: "2027-01-09", end: "2027-05-08", source, sourceUrl: null } });
assert.deepEqual(parseTeaching({ teachingStart: "2027-01-01", teachingEnd: "2027-01-01", source: "  Notice  07  " }, term), { ok: true, range: { start: "2027-01-01", end: "2027-01-01", source: "Notice 07", sourceUrl: null } }, "both may be the same date; whitespace collapses");
assert.deepEqual(parseTeaching({ teachingStart: "", teachingEnd: "", source: "", sourceUrl: "" }, term), { ok: true, range: null }, "all blank clears");
const teachingErrors = (raw: Record<string, unknown>) => { const result = parseTeaching(raw, term); assert.equal(result.ok, false, JSON.stringify(raw)); return Object.keys((result as { errors: Record<string, string[]> }).errors).sort(); };
assert.deepEqual(teachingErrors({ teachingStart: "2027-02-30", teachingEnd: "2027-05-08", source }), ["teachingStart"], "not a real date");
assert.deepEqual(teachingErrors({ teachingStart: "2027-05-08", teachingEnd: "2027-01-09", source }), ["teachingEnd"], "reversed");
assert.deepEqual(teachingErrors({ teachingStart: "2026-12-31", teachingEnd: "2027-07-01", source }), ["teachingEnd", "teachingStart"], "outside the term on both sides");
assert.deepEqual(teachingErrors({ teachingStart: "2027-01-09", teachingEnd: "2027-05-08", source: " " }), ["source"], "missing source");
assert.deepEqual(teachingErrors({ teachingStart: "2027-01-09", teachingEnd: "", source }), ["teachingEnd"], "half a range");
assert.deepEqual(teachingErrors({ teachingStart: "2027-01-09", teachingEnd: "2027-05-08", source, sourceUrl: "javascript:alert(1)" }), ["sourceUrl"], "unsafe link");
assert.deepEqual(teachingErrors({ source: "x".repeat(301), teachingStart: "2027-01-09", teachingEnd: "2027-05-08" }), ["source"], "source too long");
assert.deepEqual(teachingErrors({ teachingStart: "", teachingEnd: "", source: "", sourceUrl: "ftp://x" }), ["sourceUrl", "source", "teachingEnd", "teachingStart"].sort(), "a bad link is never a silent clear");

// Links: HTTP(S) only, no credentials, no whitespace.
for (const good of ["https://pundrauniversity.ac.bd/notice", "http://example.org/a?b=c#d", "HTTPS://Example.org"]) assert.equal(sourceUrl(good), good);
for (const bad of ["javascript:alert(1)", "data:text/html,x", "//example.org", "https://", "https://user:pw@example.org", "https://exa mple.org", "ftp://example.org", `https://${"a".repeat(500)}.org`, 5]) assert.equal(sourceUrl(bad), undefined, String(bad));
assert.equal(sourceUrl(""), null); assert.equal(sourceUrl("  "), null);
assert.equal(plainText("a\u0007b", 10), undefined, "control characters are refused"); assert.equal(plainText("a\nb", 10), undefined);

// Entries: type, title, ordered dates in the term, explicit exam effect, source.
const entry = (raw: Record<string, unknown>, fixedKind?: string) => parseEntry({ title: "Midterm exams", startDate: "2027-03-08", endDate: "2027-03-13", source: "Exam office notice 04", ...raw }, term, fixedKind);
assert.deepEqual(entry({ kind: "midterm", regularClasses: "continue" }), { ok: true, entry: { kind: "midterm", title: "Midterm exams", startDate: "2027-03-08", endDate: "2027-03-13", regularClasses: "continue", source: "Exam office notice 04", sourceUrl: null } });
const holiday = entry({ kind: "university_holiday", regularClasses: "continue", title: "University holiday", startDate: "2027-03-10", endDate: "2027-03-10" });
assert.ok(holiday.ok && holiday.entry.regularClasses === null, "only exam periods carry an effect");
const entryErrors = (raw: Record<string, unknown>, fixedKind?: string) => { const result = entry(raw, fixedKind); assert.equal(result.ok, false, JSON.stringify(raw)); return Object.keys((result as { errors: Record<string, string[]> }).errors).sort(); };
assert.deepEqual(entryErrors({ kind: "final" }), ["regularClasses"], "missing exam effect");
assert.deepEqual(entryErrors({ kind: "final", regularClasses: "maybe" }), ["regularClasses"]);
assert.deepEqual(entryErrors({ kind: "weekend" }), ["kind"]);
assert.deepEqual(entryErrors({ kind: "public_holiday", startDate: "2027-03-13", endDate: "2027-03-08" }), ["endDate"], "reversed");
assert.deepEqual(entryErrors({ kind: "public_holiday", startDate: "2026-12-25", endDate: "2027-07-02" }), ["endDate", "startDate"], "out of term");
assert.deepEqual(entryErrors({ kind: "public_holiday", startDate: "2027-13-01", endDate: "not a date" }), ["endDate", "startDate"], "bad dates");
assert.deepEqual(entryErrors({ kind: "class_suspension", source: "" }), ["source"], "missing source");
assert.deepEqual(entryErrors({ kind: "class_suspension", title: "  " }), ["title"]);
assert.deepEqual(entryErrors({ kind: "class_suspension", title: "x".repeat(121) }), ["title"]);
assert.ok(entry({ kind: "public_holiday" }, "midterm").ok === false, "a saved entry keeps its type");
// An exam period may extend beyond the teaching range while staying in the term.
assert.ok(entry({ kind: "final", regularClasses: "suspended", startDate: "2027-05-17", endDate: "2027-06-30" }).ok);

// Semantic duplicates: same type and dates, title equal after trimming, collapsing whitespace and ignoring case.
const a = { kind: "midterm", title: "Midterm Exams", startDate: "2027-03-08", endDate: "2027-03-13" };
assert.ok(sameEntryIdentity(a, { ...a, title: "  midterm   EXAMS " }));
assert.ok(!sameEntryIdentity(a, { ...a, kind: "final" })); assert.ok(!sameEntryIdentity(a, { ...a, endDate: "2027-03-12" })); assert.ok(!sameEntryIdentity(a, { ...a, title: "Midterm exam" }));
assert.equal(titleKey("  A  b "), "a b");

// Date lookup (spec table, applied in order).
let id = 0;
const e = (kind: string, startDate: string, endDate: string, regularClasses: string | null = null, title = kind): CalendarEntry => ({ id: ++id, kind, title, startDate, endDate, regularClasses, source: "S", sourceUrl: null });
const teaching = { start: "2027-01-09", end: "2027-05-08" };
const midterm = e("midterm", "2027-03-08", "2027-03-13", "continue", "Midterm exams");
const uniHoliday = e("university_holiday", "2027-03-10", "2027-03-10", null, "University holiday");
const finals = e("final", "2027-05-17", "2027-05-26", "suspended", "Final exams");
const lateSuspension = e("class_suspension", "2027-06-20", "2027-06-21", null, "Campus closure");
const entries = [finals, uniHoliday, midterm, lateSuspension];
const look = (date: string, range: typeof teaching | null = teaching, list = entries) => lookupDate(date, term, range, list);
assert.equal(look("2026-12-31").status, "outside_term"); assert.equal(look("2027-07-01").status, "outside_term"); assert.deepEqual(look("2026-12-31").entries, []);
assert.equal(look("2027-01-01").status, "outside_teaching", "term start before teaching");
assert.equal(look("2027-01-09").status, "teaching", "shared endpoint: first class day"); assert.equal(look("2027-05-08").status, "teaching", "shared endpoint: last class day");
assert.equal(look("2027-05-09").status, "outside_teaching");
const overlap = look("2027-03-10");
assert.equal(overlap.status, "suspended", "a closure wins for regular teaching"); assert.deepEqual(overlap.entries.map(item => item.id), [midterm.id, uniHoliday.id], "exam label stays visible, in date order"); assert.deepEqual(overlap.closures.map(item => item.id), [uniHoliday.id]);
const examContinues = look("2027-03-08"); assert.equal(examContinues.status, "teaching"); assert.deepEqual(examContinues.entries.map(item => item.id), [midterm.id], "a continuing exam is shown without closing");
assert.equal(look("2027-03-13").status, "teaching", "exam end date is inclusive");
assert.equal(look("2027-05-20").status, "suspended", "an exam beyond the teaching range that suspends classes");
assert.equal(look("2027-06-20").status, "suspended", "a suspension outside the teaching range is still a calendar fact");
// Partial calendar: entries recorded, teaching range unknown.
assert.equal(look("2027-03-08", null).status, "no_teaching_dates"); assert.equal(look("2027-03-08", null).entries.length, 1);
assert.equal(look("2027-03-10", null).status, "suspended", "a closure is reported even without teaching dates");
assert.equal(look("2027-02-01", null, []).status, "no_teaching_dates");
assert.ok(closesRegularClasses(e("public_holiday", "2027-02-21", "2027-02-21"))); assert.ok(!closesRegularClasses(midterm)); assert.ok(closesRegularClasses(finals));

// Stable order: start, end, type, title, id.
const twin = e("midterm", "2027-03-08", "2027-03-13", "continue", "Midterm exams");
assert.deepEqual(sortEntries([twin, uniHoliday, finals, midterm]).map(item => item.id), [midterm.id, twin.id, uniHoliday.id, finals.id]);

// Asia/Dhaka (UTC+6) civil date boundaries around midnight.
assert.equal(dhakaToday(new Date("2027-03-09T17:59:59Z")), "2027-03-09");
assert.equal(dhakaToday(new Date("2027-03-09T18:00:00Z")), "2027-03-10");
assert.equal(dhakaToday(new Date("2026-12-31T18:00:00Z")), "2027-01-01");
assert.equal(look(dhakaToday(new Date("2027-03-09T18:00:00Z"))).status, "suspended", "just after Dhaka midnight is already the holiday");

// Display.
assert.equal(longDate("2027-01-09"), "9 January 2027");
assert.equal(dateRange("2027-03-10", "2027-03-10"), "10 March 2027");
assert.equal(dateRange("2027-03-08", "2027-03-13"), "8–13 March 2027");
assert.equal(dateRange("2027-02-28", "2027-03-03"), "28 February – 3 March 2027");
assert.equal(dateRange("2026-12-30", "2027-01-02"), "30 December 2026 – 2 January 2027");

// Narrowing a draft's dates must not strand calendar dates.
assert.deepEqual(strandedByTermDates("2027-01-01", "2027-06-30", teaching, entries), []);
assert.deepEqual(strandedByTermDates("2027-01-10", "2027-06-30", teaching, entries), ["Regular teaching dates 9 January – 8 May 2027"]);
assert.deepEqual(strandedByTermDates("2027-01-01", "2027-06-01", null, entries), ["Campus closure (20–21 June 2027)"]);

console.log("CAL-01 calendar rules: teaching and entry validation, safe links, duplicates, lookup order, Dhaka date boundaries, display and stranded-date checks passed.");
