import type { PublicationRoutineMetadata } from "./serialize";

/**
 * Layout of the official routine package's contacts appendix (BUG-54).
 *
 * Pure and deterministic, like the routine sheets: heights are estimated in
 * millimetres from the print styles (`.official-plain`, `.official-directory`,
 * `.official-contacts` in globals.css), never measured. Everything goes on one
 * sheet at normal rows when it fits; otherwise on one sheet in compact rows
 * (same type, tighter padding); otherwise it continues over sheets at normal
 * rows: the teacher list (split by rows only when needed), then the class
 * representatives, then the query contacts, each of those two moving whole.
 */

type Teacher = PublicationRoutineMetadata["teachers"][number];
type Representative = PublicationRoutineMetadata["classRepresentatives"][number];
type QueryContact = PublicationRoutineMetadata["queryContacts"][number];

export interface ContactsInput { teachers: Teacher[]; classRepresentatives: Representative[]; queryContacts: QueryContact[] }
export interface ContactsTeacher extends Teacher { sl: number }
export interface TeacherColumn { teachers: ContactsTeacher[]; height: number }
export type ContactsBlock =
  | { kind: "teachers"; continued: boolean; columns: TeacherColumn[]; height: number }
  | { kind: "representatives"; tables: Array<{ stream: "HSC" | "DIPLOMA"; rows: Representative[]; height: number }>; height: number }
  | { kind: "queries"; contacts: QueryContact[]; boxesHeight: number; height: number };
export interface ContactsSheet { blocks: ContactsBlock[]; compact: boolean; height: number }

/** Millimetre measures matching the print styles. */
export const CONTACTS_MM = {
  /** Body height of a contacts sheet (159.5 mm measured), less a safety margin. */
  capacity: 157,
  contentWidth: 275,
  columnGap: 5,
  /** `.official-directory` row gap, normal and compact. */
  blockGap: 3.5,
  compactBlockGap: 2.6,
  /** Section label: 8.6pt × 1.2 plus its 1.2 mm margin. */
  label: 4.85,
  /** 6.9pt × 1.18 line. */
  line: 2.87,
  /** Cell padding top and bottom plus the collapsed border (rows measure 4.03 mm, 6.9 mm on two lines). */
  rowExtra: 0.9 + 0.26,
  compactRowExtra: 0.4 + 0.26,
  /** Outer table border, added once per table. */
  tableBorder: 0.3,
  cellPadding: 2,
  /** Conservative characters per millimetre at 6.9pt: names (53 fit in 55.4 mm) and emails (31 fit in 38.7 mm). */
  charsPerMm: 0.9,
  emailCharsPerMm: 0.8,
  teacherFixed: { sl: 6, code: 11, mobile: 19, email: 41 },
  representativeFixed: { batch: 12, mobile: 22 },
  contactColumns: 3,
  contactGap: 3,
  /** Box border and padding; lines are 8pt (name) and 7pt (the rest) × 1.3. */
  contactFrame: 0.42 + 3.2 + 0.15,
  contactNameLine: 3.67,
  contactLine: 3.21,
} as const;

const columnWidth = (CONTACTS_MM.contentWidth - CONTACTS_MM.columnGap) / 2;
const teacherNameWidth = columnWidth - CONTACTS_MM.teacherFixed.sl - CONTACTS_MM.teacherFixed.code - CONTACTS_MM.teacherFixed.mobile - CONTACTS_MM.teacherFixed.email;
const contactWidth = (CONTACTS_MM.contentWidth - CONTACTS_MM.contactGap * (CONTACTS_MM.contactColumns - 1)) / CONTACTS_MM.contactColumns - 4.42;

/** Lines a text needs in a cell of the given width, at a type size relative to 6.9pt. */
function lines(text: string, widthMm: number, sizePt = 6.9, charsPerMm: number = CONTACTS_MM.charsPerMm): number {
  const perLine = Math.max(4, Math.floor(widthMm * charsPerMm * (6.9 / sizePt)));
  return Math.max(1, Math.ceil(text.length / perLine));
}

const cellLines = (text: string, columnMm: number, charsPerMm?: number) => lines(text, columnMm - CONTACTS_MM.cellPadding, 6.9, charsPerMm);
const rowHeight = (lineCount: number, compact: boolean) => lineCount * CONTACTS_MM.line + (compact ? CONTACTS_MM.compactRowExtra : CONTACTS_MM.rowExtra);

export function teacherRowHeight(teacher: Teacher, compact = false): number {
  const name = teacher.designation ? `${teacher.fullName}, ${teacher.designation}` : teacher.fullName;
  return rowHeight(Math.max(
    cellLines(name, teacherNameWidth),
    cellLines(teacher.shortCode, CONTACTS_MM.teacherFixed.code),
    cellLines(teacher.phone ?? "-", CONTACTS_MM.teacherFixed.mobile),
    cellLines(teacher.email ?? "", CONTACTS_MM.teacherFixed.email, CONTACTS_MM.emailCharsPerMm),
  ), compact);
}

const tableHeight = (rows: number[], compact: boolean) => rowHeight(1, compact) + rows.reduce((sum, height) => sum + height, 0) + CONTACTS_MM.tableBorder;

/**
 * Two columns in order (teachers 1 to k, then the rest). k makes the taller
 * column as short as possible, with the first column never the shorter one.
 */
export function balanceColumns(teachers: ContactsTeacher[], compact: boolean): TeacherColumn[] {
  const heights = teachers.map((teacher) => teacherRowHeight(teacher, compact));
  const total = heights.reduce((sum, height) => sum + height, 0);
  let best = teachers.length;
  let bestTaller = Infinity;
  let first = 0;
  for (let k = 0; k <= teachers.length; k += 1) {
    if (k > 0) first += heights[k - 1];
    const second = total - first;
    if (first + 1e-9 < second) continue;
    if (first < bestTaller - 1e-9) { bestTaller = first; best = k; }
  }
  const columns = [teachers.slice(0, best), teachers.slice(best)];
  return columns.map((column, index) => ({
    teachers: column,
    height: tableHeight(heights.slice(index ? best : 0, index ? undefined : best), compact),
  }));
}

function teacherBlock(teachers: ContactsTeacher[], continued: boolean, compact: boolean): ContactsBlock {
  const columns = balanceColumns(teachers, compact);
  return { kind: "teachers", continued, columns, height: CONTACTS_MM.label + Math.max(...columns.map((column) => column.height)) };
}

function representativesBlock(representatives: Representative[], compact: boolean): ContactsBlock {
  const nameWidth = columnWidth - CONTACTS_MM.representativeFixed.batch - CONTACTS_MM.representativeFixed.mobile;
  const tables = (["HSC", "DIPLOMA"] as const).map((stream) => {
    const rows = representatives.filter((item) => item.stream === stream);
    const height = tableHeight(rows.map((item) => rowHeight(Math.max(
      cellLines(item.fullName ?? "Not listed", nameWidth),
      cellLines(item.phone ?? "", CONTACTS_MM.representativeFixed.mobile),
    ), compact)), compact);
    return { stream, rows, height };
  });
  return { kind: "representatives", tables, height: CONTACTS_MM.label + Math.max(...tables.map((table) => table.height)) };
}

function queriesBlock(contacts: QueryContact[]): ContactsBlock {
  const boxHeight = (contact: QueryContact) => CONTACTS_MM.contactFrame + CONTACTS_MM.contactNameLine * lines(contact.fullName, contactWidth, 8)
    + CONTACTS_MM.contactLine * (lines(contact.designation, contactWidth, 7) + lines(`Mobile ${contact.phone}`, contactWidth, 7) + (contact.email ? lines(contact.email, contactWidth, 7, CONTACTS_MM.emailCharsPerMm) : 0));
  let boxesHeight = 0;
  for (let index = 0; index < contacts.length; index += CONTACTS_MM.contactColumns) {
    boxesHeight += (index ? CONTACTS_MM.contactGap : 0) + Math.max(...contacts.slice(index, index + CONTACTS_MM.contactColumns).map(boxHeight));
  }
  return { kind: "queries", contacts, boxesHeight, height: CONTACTS_MM.label + boxesHeight };
}

const stackHeight = (blocks: ContactsBlock[], gap: number) => blocks.reduce((sum, block, index) => sum + (index ? gap : 0) + block.height, 0);

/** Lays out the contacts appendix on as few sheets as fit (BUG-54 D-1). */
export function contactsSheets(input: ContactsInput): ContactsSheet[] {
  const teachers = input.teachers.map((teacher, index) => ({ ...teacher, sl: index + 1 }));
  const extras = (compact: boolean) => [
    representativesBlock(input.classRepresentatives, compact),
    ...(input.queryContacts.length ? [queriesBlock(input.queryContacts)] : []),
  ];

  for (const compact of [false, true]) {
    const blocks = [...(teachers.length ? [teacherBlock(teachers, false, compact)] : []), ...extras(compact)];
    const height = stackHeight(blocks, compact ? CONTACTS_MM.compactBlockGap : CONTACTS_MM.blockGap);
    if (height <= CONTACTS_MM.capacity) return [{ blocks, compact, height }];
  }

  // Continue over sheets at normal rows.
  const sheets: ContactsSheet[] = [];
  let current: ContactsBlock[] = [];
  const used = () => stackHeight(current, CONTACTS_MM.blockGap);
  const room = () => CONTACTS_MM.capacity - used() - (current.length ? CONTACTS_MM.blockGap : 0);
  const flush = () => { if (current.length) sheets.push({ blocks: current, compact: false, height: used() }); current = []; };

  let rest = teachers;
  while (rest.length) {
    // The most rows whose balanced columns fit the room left on this sheet.
    let count = 0;
    for (let next = 1; next <= rest.length; next += 1) {
      if (teacherBlock(rest.slice(0, next), false, false).height > room()) break;
      count = next;
    }
    if (count === 0 && current.length) { flush(); continue; }
    count = Math.max(1, count);
    current.push(teacherBlock(rest.slice(0, count), rest !== teachers, false));
    rest = rest.slice(count);
    if (rest.length) flush();
  }
  for (const block of extras(false)) {
    if (current.length && block.height > room()) flush();
    current.push(block);
  }
  flush();
  return sheets;
}
