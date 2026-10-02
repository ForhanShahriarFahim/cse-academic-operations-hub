import assert from "node:assert/strict";
import { balanceColumns, CONTACTS_MM, contactsSheets, teacherRowHeight, type ContactsBlock, type ContactsInput, type ContactsSheet } from "../src/lib/official-contacts-sheets";

/** BUG-54: the official package's contacts appendix fits however many teachers are listed. */

type Teacher = ContactsInput["teachers"][number];
const teacher = (index: number, extra: Partial<Teacher> = {}): Teacher => ({
  shortCode: `T${String(index).padStart(3, "0")}`, fullName: `Teacher ${index}`, designation: null,
  departmentCode: "CSE", phone: "01700-000000", email: `teacher${index}@example.test`, status: "active", ...extra,
});
const long = (index: number): Teacher => teacher(index, {
  fullName: `Synthetic Resolved Teacher ${index} With Long Name`, designation: "Assistant Professor",
  email: `synthetic.teacher.${index}.with.a.long.mailbox@example.test`,
});
const teachers = (count: number, longEvery = 0) => Array.from({ length: count }, (_, index) => (longEvery && (index + 1) % longEvery === 0 ? long(index + 1) : teacher(index + 1)));

// Shaped like the Summer 2026 source: 8 HSC and 8 Diploma batches (one representative missing), three query contacts.
const representatives: ContactsInput["classRepresentatives"] = [
  ...Array.from({ length: 8 }, (_, index) => ({ stream: "HSC" as const, batchLabel: `${22 + index}B`, fullName: `Representative ${index}`, phone: "01800-000000", sortOrder: index })),
  ...Array.from({ length: 8 }, (_, index) => ({ stream: "DIPLOMA" as const, batchLabel: `${16 + index}B`, fullName: index === 7 ? null : `Representative D${index}`, phone: index === 7 ? null : "01800-000000", sortOrder: 10 + index })),
];
const queries: ContactsInput["queryContacts"] = [1, 2, 3].map((index) => ({ fullName: `Contact ${index}`, designation: "Lecturer & Course-Coordinator, Dept. of CSE, PUB", phone: "01780-000000", email: null, sortOrder: index }));
const input = (list: Teacher[], extra: Partial<ContactsInput> = {}): ContactsInput => ({ teachers: list, classRepresentatives: representatives, queryContacts: queries, ...extra });

const blocksOf = (sheets: ContactsSheet[]) => sheets.flatMap((sheet) => sheet.blocks);
const teacherBlocks = (sheets: ContactsSheet[]) => blocksOf(sheets).filter((block): block is Extract<ContactsBlock, { kind: "teachers" }> => block.kind === "teachers");
const listed = (sheets: ContactsSheet[]) => teacherBlocks(sheets).flatMap((block) => block.columns.flatMap((column) => column.teachers));

function assertWhole(sheets: ContactsSheet[], source: ContactsInput, label: string) {
  for (const sheet of sheets) assert.ok(sheet.height <= CONTACTS_MM.capacity + 1e-9, `${label}: a sheet is within capacity (${sheet.height.toFixed(1)} mm)`);
  const printed = listed(sheets);
  assert.deepEqual(printed.map((item) => item.shortCode), source.teachers.map((item) => item.shortCode), `${label}: every teacher once, in order`);
  assert.deepEqual(printed.map((item) => item.sl), source.teachers.map((_, index) => index + 1), `${label}: SL numbers are continuous`);
  assert.deepEqual(teacherBlocks(sheets).map((block) => block.continued), teacherBlocks(sheets).map((_, index) => index > 0), `${label}: later teacher parts are continued`);
  assert.equal(blocksOf(sheets).filter((block) => block.kind === "representatives").length, 1, `${label}: the class representatives appear once, whole`);
  const representativesBlock = blocksOf(sheets).find((block) => block.kind === "representatives")!;
  assert.equal(representativesBlock.kind === "representatives" && representativesBlock.tables.reduce((sum, table) => sum + table.rows.length, 0), source.classRepresentatives.length, `${label}: no representative lost`);
  assert.equal(blocksOf(sheets).filter((block) => block.kind === "queries").length, source.queryContacts.length ? 1 : 0, `${label}: the query contacts appear once, whole`);
  const order = blocksOf(sheets).map((block) => block.kind).filter((kind, index, all) => all.indexOf(kind) === index);
  assert.deepEqual(order, ["teachers", "representatives", "queries"].filter((kind) => order.includes(kind as ContactsBlock["kind"])), `${label}: teachers, then representatives, then queries`);
}

// Today's Summer 2026 shape: 38 listed teachers on one sheet at normal rows, split 19/19 as before.
const today = input(teachers(38));
const todaySheets = contactsSheets(today);
assertWhole(todaySheets, today, "38 teachers");
assert.equal(todaySheets.length, 1);
assert.equal(todaySheets[0].compact, false, "38 teachers stay at normal rows");
assert.deepEqual(teacherBlocks(todaySheets)[0].columns.map((column) => column.teachers.length), [19, 19], "equal rows split as before");

// The four placeholders resolved, two with long names (42 listed): one sheet in compact rows (D-1).
const resolved = input([...teachers(40), long(41), long(42)].sort((a, b) => a.shortCode.localeCompare(b.shortCode)));
const resolvedSheets = contactsSheets(resolved);
assertWhole(resolvedSheets, resolved, "42 teachers");
assert.equal(resolvedSheets.length, 1, "42 teachers stay on one sheet");
assert.equal(resolvedSheets[0].compact, true, "42 teachers with long names use the compact step");

// A long list continues over sheets at normal rows; the teacher list itself is split by rows.
for (const count of [72, 130]) {
  const many = input(teachers(count, 3));
  const sheets = contactsSheets(many);
  assertWhole(sheets, many, `${count} teachers`);
  assert.ok(sheets.length >= 2, `${count} teachers continue`);
  assert.ok(sheets.every((sheet) => !sheet.compact), "continued sheets use normal rows");
  if (count === 130) assert.ok(teacherBlocks(sheets).length >= 2, "130 teachers split the teacher list");
}

// Public package: no mobile or email; no query contacts; no class representatives.
const publicInput = input(teachers(60).map((item) => ({ ...item, phone: null, email: null })), { queryContacts: [], classRepresentatives: [] });
const publicSheets = contactsSheets(publicInput);
assertWhole(publicSheets, publicInput, "public, no contacts");
assert.equal(publicSheets.length, 1, "60 teachers without contacts fit one sheet");
assert.ok(teacherRowHeight(teacher(1, { phone: null, email: null })) <= teacherRowHeight(teacher(1)));
assert.deepEqual(contactsSheets(input([])).map((sheet) => sheet.blocks.map((block) => block.kind)), [["representatives", "queries"]], "no teachers still prints the other contacts");

// Balanced columns keep order, put the first column never shorter, and are never more than one row
// taller than the most even split by height.
for (const list of [teachers(38), teachers(39), teachers(41, 2), [long(1), long(2), long(3), ...teachers(20).slice(3)], teachers(1)]) {
  const numbered = list.map((item, index) => ({ ...item, sl: index + 1 }));
  const [first, second] = balanceColumns(numbered, false);
  assert.deepEqual([...first.teachers, ...second.teachers].map((item) => item.sl), numbered.map((item) => item.sl), "columns keep order");
  assert.ok(first.height + 1e-9 >= second.height, "the first column is never the shorter");
  const heights = numbered.map((item) => teacherRowHeight(item));
  const total = heights.reduce((sum, height) => sum + height, 0);
  assert.ok(first.height - second.height <= Math.max(...heights) + 1e-9 || second.teachers.length === 0 || total === 0, "no more than one row uneven");
}

// Longer text never makes a row shorter.
assert.ok(teacherRowHeight(long(1)) > teacherRowHeight(teacher(1)), "a wrapped name or email adds a line");

console.log("Official contacts sheet verification passed.");
