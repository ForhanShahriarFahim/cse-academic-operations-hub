import type { AllocationView, GroupCoverage } from "./data";
import type { RoutineSource } from "./routine-projection";
import type { ExternalCommitmentView, MeetingView } from "./serialize";
import { effectivePlan, streamDays, type GridPeriod, type Stream } from "./time-grid";
import { fmtRange, fmtRangeShort, overlaps } from "./time";

/**
 * Individual teacher routine (TCH-02).
 *
 * One pure projection feeds the screen tables, the phone agenda and the A4
 * sheet, so they always show the same classes. The layout follows the
 * department's "Individual Class Routine" template: one section per program,
 * DAY | BATCH | one column per period, only day × batch rows with classes,
 * and a new table whenever the period pattern changes. A class is counted
 * once however many batches attend.
 */

export type ProgramKey = Stream | "OTHER";

export const PROGRAM_TITLE: Record<ProgramKey, string> = {
  HSC: "B.Sc. in CSE (HSC)",
  DIPLOMA: "B.Sc. in CSE (Diploma)",
  OTHER: "Other classes",
};

export interface TeacherIdentity {
  id: number;
  fullName: string;
  shortCode: string;
  designation: string | null;
  status: string;
}

export interface TeacherClass {
  meetingId: number;
  code: string;
  title: string;
  rooms: string;
  /** Exact time, shown when the class does not fill its columns exactly. */
  time: string | null;
  coTeachers: string[];
  /** Audience note such as "CSE + EEE" or "HSC + Diploma". */
  note: string | null;
}

export interface TeacherCell { span: number; classes: TeacherClass[] }

export interface TeacherRow {
  dayOfWeek: number;
  /** First batch label, for example "25 B". */
  batchLabel: string;
  /** Further merged batches, for example ["26 B"]. */
  moreBatches: string[];
  cells: TeacherCell[];
}

export interface TeacherTableDay { dayOfWeek: number; rows: TeacherRow[] }

export interface TeacherTable {
  key: string;
  patternName: string | null;
  periods: Array<GridPeriod & { label: string }>;
  /** An extra last column for classes that overlap no period. */
  otherTimes: boolean;
  days: TeacherTableDay[];
}

export interface TeacherProgram {
  key: ProgramKey;
  title: string;
  classCount: number;
  tables: TeacherTable[];
}

export interface AgendaItem {
  kind: "class" | "external";
  key: string;
  dayOfWeek: number;
  start: number;
  end: number;
  time: string;
  code: string;
  audience: string;
  rooms: string;
  coTeachers: string[];
  note: string | null;
}

export interface NoFixedTimeItem { key: string; code: string; title: string; audience: string }

export interface OtherDepartmentItem {
  id: number;
  department: string;
  course: string | null;
  audience: string | null;
  dayOfWeek: number | null;
  time: string | null;
  room: string | null;
  verified: boolean;
  status: string;
}

export interface CreditItem { key: string; code: string; audience: string; kind: string; units: number }

export interface TeacherRoutine {
  teacher: TeacherIdentity;
  source: Pick<RoutineSource, "kind" | "termName" | "effectiveFrom" | "generatedAt" | "versionNumber" | "publishedAt">;
  programs: TeacherProgram[];
  noFixedTime: NoFixedTimeItem[];
  otherDepartments: OtherDepartmentItem[];
  credits: { total: number; items: CreditItem[] };
  figures: { classes: number; days: number; minutes: number; courses: number };
  agenda: AgendaItem[];
  /** Days any stream teaches this term, in week order (Saturday first). */
  teachingDays: number[];
  /** Every scheduled meeting of the teacher, once. */
  meetingIds: number[];
}

/** "25B" → "25 B". */
export const batchText = (label: string) => label.replace(/\s*B$/, " B");

/** Source audience labels can be untidy ("CSE+EEE+CE (HSC-DIP"): even spacing round "+", brackets closed. */
export function tidyLabel(label: string): string {
  const text = label.replace(/\s*\+\s*/g, " + ").replace(/\s+/g, " ").trim();
  const unclosed = (text.match(/\(/g) ?? []).length - (text.match(/\)/g) ?? []).length;
  return unclosed > 0 ? text + ")".repeat(unclosed) : text;
}

/** "HSC-25B + DIP-17B + EEE-22B" (coverage audience) → "HSC 25 B + Diploma 17 B + EEE-22B". */
export function audienceText(audience: string): string {
  return audience
    .split(" + ")
    .map((part) => tidyLabel(part).replace(/^HSC-(.+)$/, (_, label: string) => `HSC ${batchText(label)}`).replace(/^DIP-(.+)$/, (_, label: string) => `Diploma ${batchText(label)}`))
    .join(" + ");
}

/** Units without trailing zeros: 30, 13.5, 1.25. */
export const unitsText = (value: number) => String(Number(value.toFixed(2)));

/** "Summer 2026" → "Summer-2026", as the template writes it. */
export const termText = (termName: string) => termName.trim().replace(/\s+/g, "-");

const isScheduled = (meeting: MeetingView) => meeting.deliveryMode !== "teacher_managed";
const teaches = (meeting: MeetingView, teacherId: number) => meeting.teachers.some((teacher) => teacher.id === teacherId);

function streamsOf(meeting: MeetingView): Stream[] {
  const set = new Set(meeting.audiences.map((audience) => audience.stream));
  return (["HSC", "DIPLOMA"] as const).filter((stream) => set.has(stream));
}

function noteOf(meeting: MeetingView): string | null {
  const parts: string[] = [];
  if (streamsOf(meeting).length > 1) parts.push("HSC + Diploma");
  if (meeting.externalAudienceLabel) parts.push(tidyLabel(meeting.externalAudienceLabel));
  return parts.length ? parts.join(" · ") : null;
}

function classOf(meeting: MeetingView, teacherId: number, span: { start: number; end: number } | null): TeacherClass {
  const exact = span != null && meeting.startMinutes === span.start && meeting.endMinutes === span.end;
  const label = meeting.customTimeLabel;
  const time = label && (span == null || label !== fmtRange(span.start, span.end))
    ? label
    : exact ? null : fmtRangeShort(meeting.startMinutes, meeting.endMinutes);
  return {
    meetingId: meeting.id,
    code: meeting.courseCode,
    title: meeting.courseTitle,
    rooms: meeting.rooms.map((room) => room.code).join("/") || "Room pending",
    time,
    coTeachers: meeting.teachers.filter((teacher) => teacher.id !== teacherId).map((teacher) => teacher.shortCode),
    note: noteOf(meeting),
  };
}

/** Local and other-department audience of a meeting, for the agenda. */
function meetingAudience(meeting: MeetingView, batchOrder: (a: { batchId: number; batchLabel: string }, b: { batchId: number; batchLabel: string }) => number): string {
  const parts = streamsOf(meeting).map((stream) => {
    const labels = meeting.audiences.filter((audience) => audience.stream === stream).sort(batchOrder).map((audience) => batchText(audience.batchLabel));
    return `${stream === "HSC" ? "HSC" : "Diploma"} ${labels.join(" + ")}`;
  });
  if (meeting.externalAudienceLabel) parts.push(tidyLabel(meeting.externalAudienceLabel));
  return parts.join(" + ") || "Audience not set";
}

interface RowDraft { key: string; dayOfWeek: number; sortKey: number; labels: string[]; patternKey: string; pattern: { name: string; periods: GridPeriod[] } | null; meetings: MeetingView[] }

/** Cells for one row: overlapping classes share a cell spanning all their columns. */
function rowCells(meetings: MeetingView[], periods: GridPeriod[], teacherId: number, otherTimes: boolean): TeacherCell[] {
  const placed: Array<{ first: number; last: number; meeting: MeetingView }> = [];
  const off: MeetingView[] = [];
  for (const meeting of meetings) {
    const hit = periods.map((period, index) => (overlaps(meeting.startMinutes, meeting.endMinutes, period.start, period.end) ? index : -1)).filter((index) => index >= 0);
    if (hit.length) placed.push({ first: hit[0], last: hit[hit.length - 1], meeting });
    else off.push(meeting);
  }
  placed.sort((a, b) => a.first - b.first || a.meeting.startMinutes - b.meeting.startMinutes || a.meeting.id - b.meeting.id);
  const clusters: Array<{ first: number; last: number; meetings: MeetingView[] }> = [];
  for (const item of placed) {
    const current = clusters[clusters.length - 1];
    if (current && item.first <= current.last) {
      current.last = Math.max(current.last, item.last);
      current.meetings.push(item.meeting);
    } else clusters.push({ first: item.first, last: item.last, meetings: [item.meeting] });
  }
  const cells: TeacherCell[] = [];
  let column = 0;
  for (const cluster of clusters) {
    for (; column < cluster.first; column++) cells.push({ span: 1, classes: [] });
    const span = { start: periods[cluster.first].start, end: periods[cluster.last].end };
    cells.push({ span: cluster.last - cluster.first + 1, classes: cluster.meetings.map((meeting) => classOf(meeting, teacherId, span)) });
    column = cluster.last + 1;
  }
  for (; column < periods.length; column++) cells.push({ span: 1, classes: [] });
  if (otherTimes) {
    cells.push({
      span: 1,
      classes: off.sort((a, b) => a.startMinutes - b.startMinutes || a.id - b.id).map((meeting) => classOf(meeting, teacherId, null)),
    });
  }
  return cells;
}

function programTables(rows: RowDraft[], dayOrder: number[], teacherId: number): TeacherTable[] {
  const built: Array<{ table: TeacherTable; drafts: RowDraft[] }> = [];
  let previousKey: string | null = null;
  for (const dayOfWeek of dayOrder) {
    // Pattern blocks in the order of their first (most senior) row.
    const blocks: RowDraft[][] = [];
    const dayRows = rows
      .filter((row) => row.dayOfWeek === dayOfWeek)
      .sort((a, b) => b.sortKey - a.sortKey || a.labels.join().localeCompare(b.labels.join()));
    for (const row of dayRows) {
      const block = blocks.find((candidate) => candidate[0].patternKey === row.patternKey);
      if (block) block.push(row);
      else blocks.push([row]);
    }
    for (const block of blocks) {
      const pattern = block[0].pattern;
      let current = built[built.length - 1];
      if (!current || previousKey !== block[0].patternKey) {
        current = {
          table: {
            key: `${block[0].patternKey}-${dayOfWeek}`,
            patternName: pattern?.name ?? null,
            periods: (pattern?.periods ?? []).map((period) => ({ start: period.start, end: period.end, label: fmtRangeShort(period.start, period.end) })),
            otherTimes: false,
            days: [],
          },
          drafts: [],
        };
        built.push(current);
      }
      previousKey = block[0].patternKey;
      current.table.days.push({ dayOfWeek, rows: [] });
      current.drafts.push(...block);
    }
  }
  // Cells are built once a table's rows are known, so "Other times" applies to the whole table.
  return built.map(({ table, drafts }) => {
    const periods = table.periods.map(({ start, end }) => ({ start, end }));
    const otherTimes = drafts.some((row) => row.meetings.some((meeting) =>
      !periods.some((period) => overlaps(meeting.startMinutes, meeting.endMinutes, period.start, period.end))));
    return {
      ...table,
      otherTimes,
      days: table.days.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        rows: drafts.filter((row) => row.dayOfWeek === day.dayOfWeek).map((row) => ({
          dayOfWeek: day.dayOfWeek,
          batchLabel: row.labels[0] ?? "",
          moreBatches: row.labels.slice(1),
          cells: rowCells(row.meetings, periods, teacherId, otherTimes),
        })),
      })),
    };
  });
}

export function projectTeacherRoutine({
  source,
  teacher,
  allocations,
  coverage,
}: {
  source: RoutineSource;
  teacher: TeacherIdentity;
  /** Approved workload allocations of the active term (current records, also for a publication). */
  allocations: AllocationView[];
  coverage: GroupCoverage[];
}): TeacherRoutine {
  const grid = source.timeGrid;
  const sortOrder = new Map(source.batches.map((batch) => [batch.id, batch.sortOrder]));
  const batchOrder = (a: { batchId: number; batchLabel: string }, b: { batchId: number; batchLabel: string }) =>
    (sortOrder.get(b.batchId) ?? 0) - (sortOrder.get(a.batchId) ?? 0) || a.batchLabel.localeCompare(b.batchLabel);

  const meetings = source.meetings
    .filter((meeting) => teaches(meeting, teacher.id) && isScheduled(meeting))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes || a.id - b.id);

  const programs: TeacherProgram[] = [];
  for (const key of ["HSC", "DIPLOMA", "OTHER"] as const) {
    const programMeetings = meetings.filter((meeting) => key === "OTHER" ? streamsOf(meeting).length === 0 : streamsOf(meeting).includes(key));
    if (!programMeetings.length) continue;
    const rows = new Map<string, RowDraft>();
    for (const meeting of programMeetings) {
      const audiences = key === "OTHER" ? [] : meeting.audiences.filter((audience) => audience.stream === key).sort(batchOrder);
      const labels = key === "OTHER" ? [tidyLabel(meeting.externalAudienceLabel ?? "—")] : audiences.map((audience) => batchText(audience.batchLabel));
      const rowKey = `${meeting.dayOfWeek}|${key === "OTHER" ? labels[0] : audiences.map((audience) => audience.batchId).join("+")}`;
      let row = rows.get(rowKey);
      if (!row) {
        const pattern = key === "OTHER" || !audiences.length ? null : effectivePlan(grid, key, audiences[0].batchId, meeting.dayOfWeek).pattern;
        row = {
          key: rowKey,
          dayOfWeek: meeting.dayOfWeek,
          sortKey: audiences.length ? sortOrder.get(audiences[0].batchId) ?? 0 : -1,
          labels,
          patternKey: pattern ? String(pattern.id) : "none",
          pattern: pattern ? { name: pattern.name, periods: pattern.periods } : null,
          meetings: [],
        };
        rows.set(rowKey, row);
      }
      row.meetings.push(meeting);
    }
    const ownDays = key === "OTHER" ? [] : streamDays(grid, key);
    const extraDays = [...new Set(programMeetings.map((meeting) => meeting.dayOfWeek))].filter((day) => !ownDays.includes(day)).sort((a, b) => a - b);
    programs.push({
      key,
      title: PROGRAM_TITLE[key],
      classCount: programMeetings.length,
      tables: programTables([...rows.values()], [...ownDays, ...extraDays], teacher.id),
    });
  }

  const coverageById = new Map(coverage.map((item) => [item.teachingGroupId, item]));
  const mine = allocations.filter((allocation) => allocation.teacherId === teacher.id);

  const noFixed = new Map<string, NoFixedTimeItem>();
  for (const allocation of mine) {
    const group = allocation.teachingGroupId != null ? coverageById.get(allocation.teachingGroupId) : undefined;
    if (group?.deliveryMode === "teacher_managed") {
      noFixed.set(`group-${group.teachingGroupId}`, { key: `group-${group.teachingGroupId}`, code: group.courseCode, title: group.courseTitle, audience: audienceText(group.audience) });
    }
  }
  for (const meeting of source.meetings.filter((item) => teaches(item, teacher.id) && !isScheduled(item))) {
    const key = `group-${meeting.teachingGroupId}`;
    if (!noFixed.has(key)) noFixed.set(key, { key, code: meeting.courseCode, title: meeting.courseTitle, audience: meetingAudience(meeting, batchOrder) });
  }

  const externals = source.externals
    .filter((item) => item.teacherId === teacher.id)
    .sort((a, b) => (a.dayOfWeek ?? 9) - (b.dayOfWeek ?? 9) || (a.startMinutes ?? 0) - (b.startMinutes ?? 0) || a.id - b.id);
  const otherDepartments = externals.map<OtherDepartmentItem>((item) => ({
    id: item.id,
    department: item.counterpartDepartment,
    course: item.courseLabel,
    audience: item.audienceLabel,
    dayOfWeek: item.dayOfWeek,
    time: externalTime(item),
    room: item.roomCode,
    verified: item.verificationStatus === "verified",
    status: item.verificationStatus,
  }));

  const creditItems = mine
    .map<CreditItem>((allocation) => {
      const group = allocation.teachingGroupId != null ? coverageById.get(allocation.teachingGroupId) : undefined;
      const shared = allocation.allocationMethod === "shared_policy" && group
        ? group.teacherCodes.filter((code) => code !== teacher.shortCode)
        : [];
      const base = allocation.externalDepartment
        ? "Other department"
        : group?.deliveryMode === "teacher_managed"
          ? "No fixed time"
          : group?.courseType === "sessional" ? "Lab" : "Theory";
      return {
        key: `allocation-${allocation.id}`,
        code: allocation.courseCode ?? allocation.externalDepartment ?? "External",
        audience: allocation.externalDepartment ? `Department of ${allocation.externalDepartment}` : group ? audienceText(group.audience) : "",
        kind: shared.length ? `${base}, shared with ${shared.join(", ")}` : base,
        units: allocation.units,
      };
    })
    .sort((a, b) => Number(a.kind === "Other department") - Number(b.kind === "Other department") || a.code.localeCompare(b.code) || a.audience.localeCompare(b.audience));
  const total = Number(mine.reduce((sum, allocation) => sum + allocation.units, 0).toFixed(2));

  const agenda: AgendaItem[] = [
    ...meetings.map<AgendaItem>((meeting) => ({
      kind: "class",
      key: `m-${meeting.id}`,
      dayOfWeek: meeting.dayOfWeek,
      start: meeting.startMinutes,
      end: meeting.endMinutes,
      time: meeting.customTimeLabel ?? fmtRangeShort(meeting.startMinutes, meeting.endMinutes),
      code: meeting.courseCode,
      audience: meetingAudience(meeting, batchOrder),
      rooms: meeting.rooms.map((room) => room.code).join("/") || "Room pending",
      coTeachers: meeting.teachers.filter((item) => item.id !== teacher.id).map((item) => item.shortCode),
      note: null,
    })),
    ...externals
      .filter((item) => item.dayOfWeek != null && item.startMinutes != null && item.endMinutes != null)
      .map<AgendaItem>((item) => ({
        kind: "external",
        key: `x-${item.id}`,
        dayOfWeek: item.dayOfWeek!,
        start: item.startMinutes!,
        end: item.endMinutes!,
        time: fmtRangeShort(item.startMinutes!, item.endMinutes!),
        code: item.courseLabel ?? "Class",
        audience: `Department of ${item.counterpartDepartment}`,
        rooms: item.roomCode ?? "Room not recorded",
        coTeachers: [],
        note: "Other department",
      })),
  ].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.start - b.start || a.key.localeCompare(b.key));

  const teachingDays = [...new Set([...streamDays(grid, "HSC"), ...streamDays(grid, "DIPLOMA")])].sort((a, b) => a - b);

  return {
    teacher,
    source: {
      kind: source.kind,
      termName: source.termName,
      effectiveFrom: source.effectiveFrom,
      generatedAt: source.generatedAt,
      versionNumber: source.versionNumber,
      publishedAt: source.publishedAt ?? null,
    },
    programs,
    noFixedTime: [...noFixed.values()].sort((a, b) => a.code.localeCompare(b.code)),
    otherDepartments,
    credits: { total, items: creditItems },
    figures: {
      classes: meetings.length,
      days: new Set(meetings.map((meeting) => meeting.dayOfWeek)).size,
      minutes: meetings.reduce((sum, meeting) => sum + meeting.endMinutes - meeting.startMinutes, 0),
      courses: new Set(meetings.map((meeting) => meeting.courseCode)).size,
    },
    agenda,
    teachingDays,
    meetingIds: meetings.map((meeting) => meeting.id),
  };
}

function externalTime(item: ExternalCommitmentView): string | null {
  return item.startMinutes != null && item.endMinutes != null ? fmtRangeShort(item.startMinutes, item.endMinutes) : null;
}

/** Comparable description of one class; any change here counts as a changed class. */
function signature(meeting: MeetingView): string {
  return [
    meeting.courseCode,
    meeting.audiences.map((audience) => audience.batchId).sort((a, b) => a - b).join("+"),
    meeting.externalAudienceLabel ?? "",
    meeting.dayOfWeek,
    meeting.startMinutes,
    meeting.endMinutes,
    meeting.rooms.map((room) => room.code).sort().join("/"),
    meeting.teachers.map((teacher) => teacher.id).sort((a, b) => a - b).join("+"),
  ].join("|");
}

/**
 * How many of a teacher's classes differ between the working draft and a
 * publication: a class of the same teaching group that moved or changed counts
 * once as changed; the rest count as added or removed.
 */
export function teacherRoutineDiff(draft: MeetingView[], published: MeetingView[], teacherId: number) {
  const pick = (list: MeetingView[]) => list.filter((meeting) => teaches(meeting, teacherId) && isScheduled(meeting));
  const remaining = new Map<string, number>();
  for (const meeting of pick(published)) remaining.set(signature(meeting), (remaining.get(signature(meeting)) ?? 0) + 1);
  const newOnes: MeetingView[] = [];
  for (const meeting of pick(draft)) {
    const count = remaining.get(signature(meeting)) ?? 0;
    if (count > 0) remaining.set(signature(meeting), count - 1);
    else newOnes.push(meeting);
  }
  const goneOnes = pick(published).filter((meeting) => {
    const count = remaining.get(signature(meeting)) ?? 0;
    if (count > 0) { remaining.set(signature(meeting), count - 1); return true; }
    return false;
  });
  let changed = 0;
  const added: MeetingView[] = [];
  for (const meeting of newOnes) {
    const index = goneOnes.findIndex((candidate) => candidate.teachingGroupId === meeting.teachingGroupId);
    if (index >= 0) { goneOnes.splice(index, 1); changed++; } else added.push(meeting);
  }
  return { changed, added: added.length, removed: goneOnes.length, total: changed + added.length + goneOnes.length };
}
