import type { TeacherCell, TeacherProgram, TeacherRoutine, TeacherTable } from "./teacher-routine";

/**
 * A4 portrait layout of the individual routine (TCH-02).
 *
 * Pure and deterministic, like the official sheets: heights are estimated in
 * millimetres from the print styles (`.teacher-sheet-*` in globals.css). Rows
 * start at the template's roomy height and shrink to a minimum so a routine
 * fits one page; a routine that still does not fit continues on further pages
 * (each with the full header). A table moves whole to the next page, and is
 * split only when it alone is taller than a page.
 */

export const TEACHER_SHEET_MM = {
  /** Body height on an A4 portrait sheet under the header and above the footer, with a safety margin. */
  capacity: 220,
  contentWidth: 186,
  dayColumn: 23,
  batchColumn: 19,
  programHead: 7.6,
  tableHead: 8.6,
  tableGap: 3.2,
  rowMax: 12.5,
  rowMin: 9,
  codeLine: 3.9,
  line: 3.5,
  smallLine: 3.1,
  cellPadding: 1.8,
  classGap: 1.2,
  charsPerMm: 0.62,
  listsHead: 9.5,
  listLine: 4.3,
} as const;

export interface SheetTablePart {
  table: TeacherTable;
  /** Indexes into `table.days` and their rows, in order. */
  rows: Array<{ day: number; row: number }>;
  rowHeights: number[];
  continued: boolean;
}

export type SheetBlock =
  | { kind: "program"; program: TeacherProgram; continued: boolean }
  | { kind: "table"; part: SheetTablePart }
  | { kind: "lists" };

export interface TeacherSheetPage { blocks: SheetBlock[] }

export interface TeacherSheetLayout { rowHeight: number; pages: TeacherSheetPage[] }

const lines = (text: string, widthMm: number) =>
  Math.max(1, Math.ceil(text.length / Math.max(6, (widthMm - 2) * TEACHER_SHEET_MM.charsPerMm)));

function cellHeight(cell: TeacherCell, widthMm: number): number {
  if (!cell.classes.length) return 0;
  const mm = TEACHER_SHEET_MM;
  return cell.classes.reduce((sum, item) => {
    let height = lines(item.code, widthMm) * mm.codeLine + lines([item.rooms, item.note].filter(Boolean).join(" · "), widthMm) * mm.line;
    if (item.time) height += mm.smallLine;
    if (item.coTeachers.length) height += mm.smallLine;
    return sum + height;
  }, 0) + (cell.classes.length - 1) * mm.classGap;
}

/** Content height of every row of a table, before the uniform row height is applied. */
function contentHeights(table: TeacherTable): number[] {
  const mm = TEACHER_SHEET_MM;
  const columns = table.periods.length + (table.otherTimes ? 1 : 0);
  const columnWidth = (mm.contentWidth - mm.dayColumn - mm.batchColumn) / Math.max(1, columns);
  return table.days.flatMap((day) => day.rows.map((row) => {
    const labelHeight = (1 + Math.ceil(row.moreBatches.length / 2)) * mm.line;
    const tallest = Math.max(labelHeight, ...row.cells.map((cell) => cellHeight(cell, columnWidth * cell.span)));
    return tallest + mm.cellPadding;
  }));
}

function listsHeight(routine: TeacherRoutine): number {
  const mm = TEACHER_SHEET_MM;
  const count = (items: string[]) => items.reduce((sum, text) => sum + lines(text, mm.contentWidth / 2 - 4), 0);
  const left = count(routine.noFixedTime.map((item) => `${item.code} ${item.title} · ${item.audience} · arranged by the teacher`));
  const right = count(routine.otherDepartments.map((item) => [item.course, item.department, item.time, item.room].filter(Boolean).join(" · ")));
  return mm.listsHead + Math.max(1, left, right) * mm.listLine;
}

interface Measured { table: TeacherTable; content: number[] }

function totalHeight(programs: Array<{ program: TeacherProgram; tables: Measured[] }>, rowHeight: number, lists: number): number {
  const mm = TEACHER_SHEET_MM;
  let height = lists;
  for (const { tables } of programs) {
    height += mm.programHead;
    for (const { content } of tables) {
      height += mm.tableHead + content.reduce((sum, value) => sum + Math.max(rowHeight, value), 0) + mm.tableGap;
    }
  }
  return height;
}

export function teacherSheetLayout(routine: TeacherRoutine): TeacherSheetLayout {
  const mm = TEACHER_SHEET_MM;
  const programs = routine.programs.map((program) => ({
    program,
    tables: program.tables.map<Measured>((table) => ({ table, content: contentHeights(table) })),
  }));
  const lists = listsHeight(routine);

  // The tallest uniform row height that fits one page, within the template's range.
  const rowCount = programs.reduce((sum, item) => sum + item.tables.reduce((count, table) => count + table.content.length, 0), 0);
  let rowHeight: number = mm.rowMax;
  if (rowCount > 0 && totalHeight(programs, mm.rowMax, lists) > mm.capacity) {
    const spare = mm.capacity - totalHeight(programs, 0, lists);
    rowHeight = Math.max(mm.rowMin, Math.min(mm.rowMax, Math.floor((spare / rowCount) * 10) / 10));
  }

  const pages: TeacherSheetPage[] = [{ blocks: [] }];
  let used = 0;
  const page = () => pages[pages.length - 1];
  const newPage = () => { pages.push({ blocks: [] }); used = 0; };

  for (const { program, tables } of programs) {
    tables.forEach(({ table, content }, tableIndex) => {
      const heights = content.map((value) => Math.max(rowHeight, value));
      const rows = table.days.flatMap((day, dayIndex) => day.rows.map((_, rowIndex) => ({ day: dayIndex, row: rowIndex })));
      const head = (tableIndex === 0 ? mm.programHead : 0) + mm.tableHead;
      const whole = head + heights.reduce((sum, value) => sum + value, 0) + mm.tableGap;
      if (used > 0 && used + whole > mm.capacity) newPage();
      let start = 0;
      let continued = false;
      while (start < rows.length) {
        // A program heading opens its first table, and is repeated when a page starts mid-program.
        if (tableIndex === 0 || used === 0) {
          page().blocks.push({ kind: "program", program, continued: tableIndex > 0 || continued });
          used += mm.programHead;
        }
        let end = start;
        let height = mm.tableHead;
        while (end < rows.length && (end === start || used + height + heights[end] + mm.tableGap <= mm.capacity)) {
          height += heights[end];
          end++;
        }
        page().blocks.push({ kind: "table", part: { table, rows: rows.slice(start, end), rowHeights: heights.slice(start, end), continued } });
        used += height + mm.tableGap;
        start = end;
        if (start < rows.length) { newPage(); continued = true; }
      }
    });
  }
  if (used > 0 && used + lists > mm.capacity) newPage();
  page().blocks.push({ kind: "lists" });
  return { rowHeight, pages };
}
