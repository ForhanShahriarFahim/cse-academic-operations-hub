import type { ProjectedBatchRow, ProjectedMeeting, RoutineDayProjection } from "./routine-projection";
import { fmtRange, fmtRangeShort, overlaps } from "./time";

/**
 * Layout of the official routine package's routine sheets (RUT-04 amendment B).
 *
 * Pure and deterministic, so the server can lay out A4 sheets without
 * measuring: each day becomes one table on the day's main periods; a batch on
 * other periods that day (or with classes outside them) gets one row with each
 * time written above its classes. Heights are estimated in millimetres from
 * the print styles (`.official-*` in globals.css) and sheets are filled
 * without splitting a table, unless a table alone is taller than a sheet.
 */

export interface SheetClass { code: string; teachers: string; rooms: string; note: string | null; time: string | null }
export interface SheetSegment { start: number; time: string; classes: SheetClass[] }
export type SheetCell =
  | { kind: "classes"; span: number; classes: SheetClass[] }
  | { kind: "own"; span: number; segments: SheetSegment[] };
export interface SheetRow { batchLabel: string; cells: SheetCell[]; height: number }
export interface SheetBreak { afterSlot: number; label: string }
export interface SheetTable {
  dayOfWeek: number;
  slots: string[];
  breaks: SheetBreak[];
  rows: SheetRow[];
  /** Other departments' bookings per slot; only on a day's last table part. */
  od: string[][] | null;
  /** A later part of a day too tall for one sheet. */
  continued: boolean;
  /** Width of one period column, for the height estimate. */
  slotWidth: number;
  height: number;
}
export interface RoutineSheet { tables: SheetTable[]; days: number[] }

/** Millimetre measures matching the print styles. */
export const SHEET_MM = {
  /** Body height available for tables on an A4 landscape sheet, with a safety margin. */
  capacity: 152,
  tableGap: 3,
  contentWidth: 275,
  dayColumn: 8.5,
  batchColumn: 13,
  breakColumn: 7,
  headRow: 5.8,
  /** Header height when a vertical "Break" label sets it. */
  breakHead: 7.8,
  rowMin: 6.6,
  odMin: 4.4,
  line: 3.0,
  smallLine: 2.7,
  cellPadding: 1.3,
  charsPerMm: 0.8,
} as const;

interface Run { first: number; span: number; start: number; end: number; items: ProjectedMeeting[] }
interface SlotRange { start: number; end: number }

const meetingClass = (item: ProjectedMeeting, start: number, end: number): SheetClass => {
  const meeting = item.meeting;
  const label = meeting.customTimeLabel;
  const exact = meeting.startMinutes === start && meeting.endMinutes === end;
  return {
    code: meeting.courseCode,
    teachers: meeting.teachers.map((teacher) => teacher.shortCode).join("/") || "UT",
    rooms: meeting.rooms.map((room) => room.code).join("/") || "Room pending",
    note: meeting.externalAudienceLabel,
    time: label && label !== fmtRange(start, end) ? label : exact ? null : fmtRangeShort(meeting.startMinutes, meeting.endMinutes),
  };
};

/** Consecutive slots of a row; a class running on into following empty slots is merged across them. */
function slotRuns(row: ProjectedBatchRow, slots: SlotRange[], regions: Array<[number, number]>): Run[] {
  const runs: Run[] = [];
  for (const [first, last] of regions) {
    let index = first;
    while (index <= last) {
      const items = row.slots[index]?.meetings ?? [];
      let span = 1;
      while (items.length && index + span <= last) {
        const next = row.slots[index + span];
        const continuesAlone = next.meetings.length === 0 && next.continuations.length === items.length && items.every((item) => next.continuations.includes(item));
        if (!continuesAlone) break;
        span += 1;
      }
      runs.push({ first: index, span, start: slots[index].start, end: slots[index + span - 1].end, items });
      index += span;
    }
  }
  return runs;
}

function regionsOf(slotCount: number, breaks: SheetBreak[]): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  let first = 0;
  for (const item of [...breaks].sort((a, b) => a.afterSlot - b.afterSlot)) {
    regions.push([first, item.afterSlot]);
    first = item.afterSlot + 1;
  }
  regions.push([first, slotCount - 1]);
  return regions;
}

/** A row on its own times: one segment per run of classes, split into the table's regions by start time. */
function ownCells(segments: SheetSegment[], slots: SlotRange[], regions: Array<[number, number]>): SheetCell[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const byRegion = regions.map(() => [] as SheetSegment[]);
  for (const segment of sorted) {
    let target = 0;
    regions.forEach(([first], index) => { if (slots[first].start <= segment.start) target = index; });
    byRegion[target].push(segment);
  }
  return regions.map(([first, last], index) => {
    const span = last - first + 1;
    return byRegion[index].length ? { kind: "own" as const, span, segments: byRegion[index] } : { kind: "classes" as const, span, classes: [] };
  });
}

const textLines = (text: string, widthMm: number) => Math.max(1, Math.ceil(text.length / Math.max(4, (widthMm - 2) * SHEET_MM.charsPerMm)));

function classHeight(item: SheetClass, widthMm: number): number {
  const first = textLines(`${item.code} (${item.teachers})`, widthMm);
  const second = textLines([item.rooms, item.note, item.time].filter(Boolean).join(" · "), widthMm);
  return (first + second) * SHEET_MM.line;
}

function cellHeight(cell: SheetCell, widthMm: number): number {
  if (cell.kind === "classes") {
    return cell.classes.reduce((sum, item) => sum + classHeight(item, widthMm), 0) + Math.max(0, cell.classes.length - 1);
  }
  const segmentWidth = widthMm / cell.segments.length;
  return SHEET_MM.smallLine + 1 + Math.max(...cell.segments.map((segment) => {
    const classWidth = segmentWidth / Math.max(1, segment.classes.length) - 2;
    return Math.max(0, ...segment.classes.map((item) => classHeight(item, classWidth)));
  }));
}

/** Builds the table for one day; rows follow the stream's batch order. */
export function dayTable(day: RoutineDayProjection): SheetTable {
  const host = day.groups[0];
  const slots: SlotRange[] = host && host.slots.length ? host.slots : [{ start: 0, end: 24 * 60 }];
  const slotLabels = host && host.slots.length ? host.slots.map((slot) => fmtRangeShort(slot.start, slot.end)) : ["Classes at their own times"];
  const breaks: SheetBreak[] = (host?.breaks ?? []).map((item) => ({
    afterSlot: item.afterSlot,
    label: `${item.name} ${fmtRangeShort(item.startMinutes, item.endMinutes)}`,
  }));
  const regions = regionsOf(slots.length, breaks);

  const entries = day.groups.flatMap((group, groupIndex) => group.rows.map((row) => ({ row, group, isHost: groupIndex === 0 && host.slots.length > 0 })));
  entries.sort((a, b) => b.row.batch.sortOrder - a.row.batch.sortOrder || a.row.batch.label.localeCompare(b.row.batch.label));
  // Classes outside the day's periods for batches on those periods go in an extra last column.
  const otherTimes = entries.some(({ row, isHost }) => isHost && !row.unplanned && row.offGrid.length > 0);
  if (otherTimes) slotLabels.push("Other times");
  const slotWidth = (SHEET_MM.contentWidth - SHEET_MM.dayColumn - SHEET_MM.batchColumn - SHEET_MM.breakColumn * breaks.length) / slotLabels.length;
  const empty: SheetCell = { kind: "classes", span: 1, classes: [] };

  const rows = entries.map<SheetRow>(({ row, group, isHost }) => {
    let cells: SheetCell[];
    if (isHost && !row.unplanned) {
      cells = slotRuns(row, slots, regions).map((run) => ({
        kind: "classes", span: run.span, classes: run.items.map((item) => meetingClass(item, run.start, run.end)),
      }));
      if (otherTimes) cells.push({ kind: "classes", span: 1, classes: row.offGrid.map((item) => meetingClass(item, -1, -1)) });
    } else {
      const own = group.slots.length ? slotRuns(row, group.slots, [[0, group.slots.length - 1]]) : [];
      const segments: SheetSegment[] = [
        ...own.filter((run) => run.items.length).map((run) => ({
          start: run.start, time: fmtRangeShort(run.start, run.end), classes: run.items.map((item) => meetingClass(item, run.start, run.end)),
        })),
        ...row.offGrid.map((item) => ({
          start: item.meeting.startMinutes,
          time: fmtRangeShort(item.meeting.startMinutes, item.meeting.endMinutes),
          classes: [meetingClass(item, item.meeting.startMinutes, item.meeting.endMinutes)],
        })),
      ];
      cells = ownCells(segments, slots, regions);
      if (otherTimes) cells.push(empty);
    }
    const tallest = Math.max(0, ...cells.map((cell) => cellHeight(cell, slotWidth * cell.span)));
    return { batchLabel: row.batch.label, cells, height: Math.max(SHEET_MM.rowMin, tallest + SHEET_MM.cellPadding) };
  });

  const od = host && host.slots.length ? host.slots.map((slot) => day.externals
    .filter((item) => item.startMinutes != null && item.endMinutes != null && overlaps(item.startMinutes, item.endMinutes, slot.start, slot.end))
    .map((item) => `${item.roomCode ?? item.teacherShortCode ?? "?"} (${item.counterpartDepartment})`)) : null;
  if (od && otherTimes) od.push([]);

  const table: SheetTable = { dayOfWeek: day.dayOfWeek, slots: slotLabels, breaks, rows, od, continued: false, slotWidth, height: 0 };
  table.height = tableHeight(table);
  return table;
}

function headHeight(table: SheetTable) {
  const labels = SHEET_MM.headRow + (Math.max(...table.slots.map((label) => textLines(label, table.slotWidth))) - 1) * SHEET_MM.line;
  return table.breaks.length ? Math.max(labels, SHEET_MM.breakHead) : labels;
}

function odHeight(od: string[][] | null) {
  if (!od) return 0;
  return Math.max(SHEET_MM.odMin, Math.max(0, ...od.map((entries) => entries.length)) * SHEET_MM.smallLine + 1.4);
}

function tableHeight(table: SheetTable) {
  return headHeight(table) + table.rows.reduce((sum, row) => sum + row.height, 0) + odHeight(table.od) + 0.6;
}

/** Splits a table taller than a sheet into parts that fit, repeating its header. */
function fitTable(table: SheetTable): SheetTable[] {
  if (table.height <= SHEET_MM.capacity) return [table];
  const head = headHeight(table) + 0.6;
  const parts: SheetTable[] = [];
  let rows: SheetRow[] = [];
  let used = head;
  const flush = (last: boolean) => {
    const part: SheetTable = { ...table, rows, od: last ? table.od : null, continued: parts.length > 0, height: 0 };
    part.height = tableHeight(part);
    parts.push(part);
    rows = [];
    used = head;
  };
  table.rows.forEach((row, index) => {
    const isLast = index === table.rows.length - 1;
    const need = row.height + (isLast ? odHeight(table.od) : 0);
    if (rows.length && used + need > SHEET_MM.capacity) flush(false);
    rows.push(row);
    used += row.height;
    if (isLast) flush(true);
  });
  return parts;
}

/** Fills A4 sheets with day tables in order; a table moves whole to the next sheet when it does not fit. */
export function routineSheets(days: RoutineDayProjection[]): RoutineSheet[] {
  const sheets: RoutineSheet[] = [];
  let used = 0;
  for (const table of days.flatMap((day) => fitTable(dayTable(day)))) {
    const current = sheets[sheets.length - 1];
    if (!current || used + SHEET_MM.tableGap + table.height > SHEET_MM.capacity) {
      sheets.push({ tables: [table], days: [table.dayOfWeek] });
      used = table.height;
      continue;
    }
    current.tables.push(table);
    if (!current.days.includes(table.dayOfWeek)) current.days.push(table.dayOfWeek);
    used += SHEET_MM.tableGap + table.height;
  }
  return sheets.length ? sheets : [{ tables: [], days: [] }];
}
