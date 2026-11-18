import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseStudentRows } from "../src/lib/attendance";
import { mapWorkbookRows, readStudentWorkbook, studentWorkbookMessage, writeStudentWorkbook } from "../src/lib/student-workbook";

const worksheet = "xl/worksheets/sheet1.xml";
const relationships = "xl/_rels/workbook.xml.rels";
const headers = ["Student ID", "Student Name", "Audience Type"];

export function workbookFixture(code: string) {
  const parts = unzipSync(writeStudentWorkbook([headers, [code, "Synthetic Workbook Student", "external"]]));
  parts["xl/workbook.xml"] = strToU8(strFromU8(parts["xl/workbook.xml"]).replace("</sheets>",
    '<sheet name="Other group" sheetId="2" r:id="rId2"/><sheet name="Hidden" state="hidden" sheetId="3" r:id="rId3"/></sheets>'));
  parts[relationships] = strToU8(strFromU8(parts[relationships]).replace("</Relationships>", [2, 3].map(id =>
    `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${id}.xml"/>`).join("") + "</Relationships>"));
  parts["[Content_Types].xml"] = strToU8(strFromU8(parts["[Content_Types].xml"]).replace("</Types>", [2, 3].map(id =>
    `<Override PartName="/xl/worksheets/sheet${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + "</Types>"));
  parts[worksheet] = strToU8(strFromU8(parts[worksheet]).replace("</sheetData>",
    '<row r="8" hidden="1"><c r="A8"><f>1+1</f><v>2</v></c><c r="B8" t="inlineStr"><is><t>Formula Student</t></is></c></row></sheetData>'));
  parts["xl/worksheets/sheet2.xml"] = parts[worksheet];
  parts["xl/worksheets/sheet3.xml"] = parts[worksheet];
  return Buffer.from(zipSync(parts));
}

async function verify() {
  const mapping = ["studentCode", "fullName", "audienceType"] as const;
  const input = workbookFixture("0000141");
  const { choices, selected } = await readStudentWorkbook(input);
  assert.deepEqual(choices.map(sheet => sheet.name), ["Students", "Other group"]);
  assert.equal(selected, undefined);
  assert.equal((await readStudentWorkbook(input, "rId3")).selected, undefined);
  const first = (await readStudentWorkbook(input, choices[0].id)).selected!;
  assert.deepEqual(first.headings, headers);
  const parsed = parseStudentRows(mapping, mapWorkbookRows(first.rows, mapping));
  assert.deepEqual(parsed.rows, [{ row: 2, studentCode: "0000141", fullName: "Synthetic Workbook Student", phone: null, department: null, audienceType: "external" }]);
  assert.deepEqual(parsed.issues.map(row => [row.row, row.kind]), [[8, "failed"]]);
  assert.match(parsed.issues[0].message, /Student ID/);
  const roundTrip = (await readStudentWorkbook(Buffer.from(writeStudentWorkbook([headers, ["+0001", "=Émile & < _x1234_", "merged"]])))).selected!;
  assert.deepEqual(mapWorkbookRows(roundTrip.rows, mapping), [{ row: 2, values: ["+0001", "=Émile & < _x1234_", "merged"] }]);
  const blank = (await readStudentWorkbook(Buffer.from(writeStudentWorkbook([headers])))).selected!;
  assert.deepEqual(blank.rows, []);

  const fixture = unzipSync(input);
  const sharedParts = { ...fixture,
    [worksheet]: strToU8(strFromU8(fixture[worksheet]).replace('<c t="inlineStr"><is><t xml:space="preserve">0000141</t></is></c>', '<c t="s"><v>0</v></c>')),
    [relationships]: strToU8(strFromU8(fixture[relationships]).replace("</Relationships>",
      '<Relationship Id="shared" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')),
    "xl/sharedStrings.xml": strToU8('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>000</t></r><r><t>0141</t></r></si></sst>'),
  };
  const shared = (await readStudentWorkbook(Buffer.from(zipSync(sharedParts)), "rId1")).selected!;
  assert.deepEqual(mapWorkbookRows(shared.rows, mapping)[0], { row: 2, values: ["0000141", "Synthetic Workbook Student", "external"] });
  async function refuses(changes: Record<string, Uint8Array>, message: RegExp) {
    await assert.rejects(() => readStudentWorkbook(Buffer.from(zipSync({ ...fixture, ...changes })), "rId1"),
      (error: unknown) => message.test(studentWorkbookMessage(error)));
  }
  const xml = strFromU8(fixture[worksheet]);
  await refuses({ [worksheet]: strToU8(xml.replace('r="8"', 'r="2001"')) }, /2,000/);
  await refuses({ [worksheet]: strToU8(xml.replace("A8", "BM8").replace("B8", "BN8")) }, /64 columns/);
  await refuses({ [worksheet]: strToU8(xml.replace("</sheetData>", Array.from({ length: 500 }, (_, i) =>
    `<row r="${i + 9}"><c t="n"><v>4</v></c></row>`).join("") + "</sheetData>")) }, /500 nonblank/);
  await refuses({ [worksheet]: strToU8("<!DOCTYPE worksheet>" + xml) }, /could not be read/);
  await refuses({ "extra.xml": strToU8("x".repeat(8 * 1024 * 1024)) }, /8 MiB/);
  await refuses(Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`extra${i}.xml`, new Uint8Array()])), /too many parts/);
  await refuses({ "xl/vbaProject.bin": new Uint8Array() }, /without macros or external links/);
  await refuses({ [relationships]: strToU8(strFromU8(fixture[relationships]).replace("</Relationships>",
    '<Relationship Id="external" Type="hyperlink" Target="https://example.invalid" TargetMode="External"/></Relationships>')) }, /without macros or external links/);
  await assert.rejects(() => readStudentWorkbook(Buffer.from("Student ID,Student Name")), /zip|end of central directory/i);
  console.log("Workbook bounds, sheet selection, hidden row numbers, formula refusal, safe text round-trip and empty roster passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verify().catch(error => { console.error(error); process.exitCode = 1; });
}
