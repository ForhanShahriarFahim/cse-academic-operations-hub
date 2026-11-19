/**
 * ATT-05 course attendance ledger. Database-free: filter parsing and the one
 * report projection that the screen, CSV and print views all render (D-5).
 */
import { attendanceContribution, attendanceResult } from "./attendance";
import { isUnsubmitted } from "./attendance-lifecycle";
import { safeCsv } from "./csv-safe";
import { DAY_SHORT, fmtRange24 } from "./time";

export const LEDGER_VIEWS = ["sessions", "students"] as const;
export type LedgerView = typeof LEDGER_VIEWS[number];
export const LEDGER_PHASES = ["all", "midterm", "final"] as const;
export type LedgerPhase = typeof LEDGER_PHASES[number];
export type LedgerTeacherFilter = "all" | "none" | number;
export type LedgerFilters = { phase: LedgerPhase; teacher: LedgerTeacherFilter; from: string; to: string };
export type LedgerQuery = Record<string, string | string[] | undefined>;

export const LEDGER_STATUS_LETTERS = { present: "P", late: "L", absent: "A", excused: "E" } as const;
export const LEDGER_STATUS_WORDS = { present: "Present", late: "Late", absent: "Absent", excused: "Excused" } as const;
type RecordedStatus = keyof typeof LEDGER_STATUS_WORDS;

export interface LedgerSessionInput {
  id: number; date: string; startMinutes: number | null; endMinutes: number | null; phase: string; state: string;
  voidReason: string | null; teacherId: number | null; teacherCode: string | null; teacherName: string | null;
}
export interface LedgerRecordInput { sessionId: number; studentId: number; status: string }
/** onRoster: active enrollment of an active student in an active term; always false for a completed term. */
export interface LedgerStudentInput { id: number; code: string; name: string; onRoster: boolean; enrolled: boolean }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export function ledgerDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return DAY_SHORT[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 1) % 7];
}

export type TeacherOption = { value: string; label: string };

/** Recorded session teachers in this group and term, plus "Not recorded" when any session lacks one. */
export function ledgerTeacherOptions(sessions: readonly LedgerSessionInput[]): TeacherOption[] {
  const teachers = new Map<number, string>();
  for (const session of sessions) {
    if (session.teacherId != null) teachers.set(session.teacherId, `${session.teacherCode ?? ""} · ${session.teacherName ?? ""}`.trim());
  }
  return [...[...teachers].sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0]).map(([id, label]) => ({ value: String(id), label })),
    ...(sessions.some(session => session.teacherId == null) ? [{ value: "none", label: "Not recorded" }] : [])];
}

/**
 * Invalid filter values fall back to the whole term (D-3). Unknown teachers,
 * out-of-term or reversed dates all count as invalid, and the report says so.
 */
export function parseLedgerQuery(query: LedgerQuery, term: { startDate: string; endDate: string }, teachers: readonly TeacherOption[]) {
  // A repeated parameter arrives as an array and is never a valid single choice.
  const one = (key: string) => typeof query[key] === "string" ? query[key] as string : query[key] === undefined ? undefined : null;
  const rawView = one("view");
  const view = rawView != null && (LEDGER_VIEWS as readonly string[]).includes(rawView) ? rawView as LedgerView : "sessions";
  const rawPhase = one("phase"), rawTeacher = one("teacher"), rawFrom = one("from"), rawTo = one("to");
  const phase = rawPhase || "all", teacher = rawTeacher || "all", from = rawFrom || term.startDate, to = rawTo || term.endDate;
  const phaseOk = (LEDGER_PHASES as readonly string[]).includes(phase);
  const teacherOk = teacher === "all" || teachers.some(option => option.value === teacher);
  const datesOk = validDate(from) && validDate(to) && from <= to && from >= term.startDate && to <= term.endDate;
  const invalid = (rawView !== undefined && view !== rawView) || [rawPhase, rawTeacher, rawFrom, rawTo].includes(null)
    || !phaseOk || !teacherOk || !datesOk;
  const filters: LedgerFilters = invalid
    ? { phase: "all", teacher: "all", from: term.startDate, to: term.endDate }
    : { phase: phase as LedgerPhase, teacher: teacher === "all" || teacher === "none" ? teacher : Number(teacher), from, to };
  return { view, filters, invalid };
}

export function ledgerFilterQuery(filters: LedgerFilters, term: { startDate: string; endDate: string }) {
  return {
    phase: filters.phase === "all" ? undefined : filters.phase,
    teacher: filters.teacher === "all" ? undefined : String(filters.teacher),
    from: filters.from === term.startDate ? undefined : filters.from,
    to: filters.to === term.endDate ? undefined : filters.to,
  };
}

export function ledgerFilterText(filters: LedgerFilters, teachers: readonly TeacherOption[], fmt: (iso: string) => string) {
  const phase = filters.phase === "all" ? "All phases" : filters.phase === "midterm" ? "Midterm" : "Final";
  const teacher = filters.teacher === "all" ? "All teachers"
    : teachers.find(option => option.value === String(filters.teacher))?.label ?? "Not recorded";
  return `${phase} · ${teacher} · ${fmt(filters.from)} to ${fmt(filters.to)}`;
}

/** Sessions without a time sort after timed sessions on the same date, as PostgreSQL orders nulls in ATT-04. */
const NO_TIME = 24 * 60 + 1;
const isRecorded = (status: string | undefined): status is RecordedStatus => status !== undefined && Object.hasOwn(LEDGER_STATUS_WORDS, status);

/**
 * Build the single report projection. `activeTerm` decides whether the current
 * roster defines "Not captured" and the "Not on current roster" label.
 */
export function buildLedger({ sessions, records, students, filters, activeTerm }: {
  sessions: readonly LedgerSessionInput[]; records: readonly LedgerRecordInput[]; students: readonly LedgerStudentInput[];
  filters: LedgerFilters; activeTerm: boolean;
}) {
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date)
    || (a.startMinutes ?? NO_TIME) - (b.startMinutes ?? NO_TIME) || a.id - b.id);
  const inView = ordered.filter(session => (filters.phase === "all" || session.phase === filters.phase)
    && (filters.teacher === "all" || (filters.teacher === "none" ? session.teacherId == null : session.teacherId === filters.teacher))
    && session.date >= filters.from && session.date <= filters.to);
  const bySession = new Map<number, Map<number, string>>();
  for (const record of records) {
    if (!bySession.has(record.sessionId)) bySession.set(record.sessionId, new Map());
    bySession.get(record.sessionId)!.set(record.studentId, record.status);
  }
  const roster = activeTerm ? students.filter(student => student.onRoster) : [];

  const rows = inView.map(session => {
    const voided = session.state === "voided";
    const captured = bySession.get(session.id) ?? new Map<number, string>();
    const counts = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const status of captured.values()) if (isRecorded(status)) counts[status] += 1;
    const attended = counts.present + counts.late, eligible = attended + counts.absent;
    return {
      ...session, day: ledgerDay(session.date), voided, provisional: !voided && isUnsubmitted(session.state),
      counts: voided ? null : counts,
      notCaptured: voided || !activeTerm ? null : roster.filter(student => !captured.has(student.id)).length,
      attended, eligible, percentage: voided ? null : attendanceResult(attended, eligible, null).percentage,
    };
  });
  const held = rows.filter(row => !row.voided);
  const totals = held.reduce((sum, row) => {
    for (const key of ["present", "late", "absent", "excused"] as const) sum[key] += row.counts![key];
    return sum;
  }, { present: 0, late: 0, absent: 0, excused: 0 });
  const attended = totals.present + totals.late, eligible = attended + totals.absent;
  const summary = {
    classesHeld: held.length, provisional: held.filter(row => row.provisional).length, voided: rows.length - held.length,
    teachers: new Set(held.flatMap(row => row.teacherId == null ? [] : [row.teacherId])).size,
    notRecorded: held.filter(row => row.teacherId == null).length,
    ...totals, attended, eligible, percentage: attendanceResult(attended, eligible, null).percentage,
  };

  const columns = held.map(({ id, date, day, startMinutes, endMinutes, phase, state, provisional }) =>
    ({ id, date, day, startMinutes, endMinutes, phase, state, provisional }));
  const matrix = students.flatMap(student => {
    const cells = held.map(row => {
      const status = bySession.get(row.id)?.get(student.id);
      return isRecorded(status) ? status : null;
    });
    if (!(activeTerm ? student.onRoster : student.enrolled) && cells.every(cell => cell === null)) return [];
    let attendedCount = 0, eligibleCount = 0;
    held.forEach((row, index) => {
      const contribution = attendanceContribution(row.state, cells[index]);
      attendedCount += contribution.attended;
      eligibleCount += contribution.total;
    });
    return [{
      id: student.id, code: student.code, name: student.name, notOnRoster: activeTerm && !student.onRoster, cells,
      attended: attendedCount, eligible: eligibleCount, percentage: attendanceResult(attendedCount, eligibleCount, null).percentage,
    }];
  }).sort((a, b) => a.code.localeCompare(b.code) || a.id - b.id);

  return { rows, summary, columns, matrix };
}

export type Ledger = ReturnType<typeof buildLedger>;

/** Matrix print blocks: up to `size` sessions per A4 landscape block; totals go with the last block. */
export function ledgerBlocks<T>(columns: readonly T[], size = 16) {
  const blocks: T[][] = [];
  for (let index = 0; index < columns.length; index += size) blocks.push(columns.slice(index, index + size));
  return blocks.length ? blocks : [[]];
}

export type LedgerHeading = { term: string; course: string; audience: string; groupId: number; filters: string; generated: string };

const STATE_WORDS: Record<string, string> = { draft: "Draft", submitted: "Submitted", reopened: "Reopened", locked: "Locked", voided: "Voided" };
const phaseWord = (phase: string) => phase === "final" ? "Final" : "Midterm";
const percentCell = (value: number | null) => value == null ? "" : value.toFixed(1);
export const ledgerTime = (start: number | null, end: number | null) => start != null && end != null ? fmtRange24(start, end) : "";

function preamble(heading: LedgerHeading, view: LedgerView, ledger: Ledger) {
  return [
    ["Report", `Attendance ledger · ${view === "sessions" ? "Sessions" : "Students"}`],
    ["Term", heading.term], ["Course", heading.course], ["Audience", heading.audience], ["Group", heading.groupId],
    ["Filters", heading.filters], ["Generated", heading.generated],
    ["Classes held", ledger.summary.classesHeld], ["Provisional sessions", ledger.summary.provisional],
    ["Voided sessions (excluded)", ledger.summary.voided], [],
  ];
}

/** CSV for one tab, rendered from the same projection as the screen (D-5). */
export function ledgerCsv(view: LedgerView, ledger: Ledger, heading: LedgerHeading) {
  if (view === "sessions") {
    const { summary } = ledger;
    return safeCsv([...preamble(heading, view, ledger),
      ["Date", "Day", "Time", "Phase", "Teacher", "Present", "Late", "Absent", "Excused", "Not captured", "Attendance %", "Status", "Void reason"],
      ...ledger.rows.map(row => [row.date, row.day, ledgerTime(row.startMinutes, row.endMinutes), phaseWord(row.phase),
        row.teacherId == null ? "Not recorded" : row.teacherCode ?? "",
        row.counts?.present ?? "", row.counts?.late ?? "", row.counts?.absent ?? "", row.counts?.excused ?? "",
        row.notCaptured ?? "", percentCell(row.percentage),
        `${STATE_WORDS[row.state] ?? row.state}${row.provisional ? " (provisional)" : ""}`, row.voided ? row.voidReason ?? "" : ""]),
      ["Total", "", "", "", "", summary.present, summary.late, summary.absent, summary.excused, "", percentCell(summary.percentage), `${summary.classesHeld} ${summary.classesHeld === 1 ? "class" : "classes"} held`, ""],
    ]);
  }
  return safeCsv([...preamble(heading, view, ledger),
    ["Student ID", "Student Name", "Roster", ...ledger.columns.map(column =>
      [column.date, ledgerTime(column.startMinutes, column.endMinutes), phaseWord(column.phase)].filter(Boolean).join(" ")),
    "Attended", "Eligible", "Attendance %"],
    ...ledger.matrix.map(row => [row.code, row.name, row.notOnRoster ? "Not on current roster" : "",
      ...row.cells.map(cell => cell ? LEDGER_STATUS_WORDS[cell] : "Not captured"),
      row.attended, row.eligible, percentCell(row.percentage)]),
  ]);
}

export function ledgerFilename(view: LedgerView, termId: number, groupId: number, filters: LedgerFilters) {
  return `attendance-ledger-${view}-term-${termId}-group-${groupId}-${filters.from}-to-${filters.to}.csv`;
}
