import { posix } from "node:path";
import * as zlib from "node:zlib";
import { fromBufferPromise } from "yauzl";
import { SaxesParser, type SaxesTagNS } from "saxes";
import { strToU8, zipSync } from "fflate";
import type { StudentCsvField, StudentInputRow } from "./attendance";

export const STUDENT_UPLOAD_BYTES = 256 * 1024;
export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_EXPANDED_BYTES = 8 * 1024 * 1024;
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SHEET_NAMESPACES = [MAIN_NS, "http://purl.oclc.org/ooxml/spreadsheetml/main"];
const RELATIONSHIP_NAMESPACES = [OFFICE_RELS, "http://purl.oclc.org/ooxml/officeDocument/relationships"];
const PACKAGE_RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";
const workbookType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const malformed = "This Excel workbook could not be read. Save it as a plain, unencrypted .xlsx file and try again.";
const crc32 = (zlib as Partial<typeof zlib>).crc32;

class WorkbookError extends Error {}

function reject(message = malformed): never {
  throw new WorkbookError(message);
}

export function studentWorkbookMessage(error: unknown) {
  return error instanceof WorkbookError ? error.message : malformed;
}

async function workbookParts(bytes: Buffer) {
  if (bytes.length > STUDENT_UPLOAD_BYTES) reject("Choose an Excel file up to 256 KiB.");
  const zip = await fromBufferPromise(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true });
  const files = new Map<string, Buffer>();
  const names = new Set<string>();
  let expanded = 0;
  let expected = 0;
  try {
    if (zip.entryCount > 100) reject("This workbook has too many parts. Save a smaller copy and try again.");
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      const key = name.toLowerCase();
      if (names.has(key) || entry.generalPurposeBitFlag & 1) reject();
      if (/vba|activex|(?:^|\/)externallinks\//i.test(name)) reject("Save a copy without macros or external links.");
      names.add(key);
      expected += entry.uncompressedSize;
      if (expected > MAX_EXPANDED_BYTES) reject("The expanded workbook exceeds 8 MiB. Save a smaller copy and try again.");
      if (name.endsWith("/") && !entry.uncompressedSize) continue;
      const chunks: Buffer[] = [];
      const xml = /\.(?:xml|rels)$/i.test(name);
      let checksum = 0;
      for await (const chunk of await zip.openReadStreamPromise(entry)) {
        expanded += chunk.length;
        if (expanded > MAX_EXPANDED_BYTES) reject("The expanded workbook exceeds 8 MiB. Save a smaller copy and try again.");
        if (crc32) checksum = crc32(chunk, checksum);
        if (xml) chunks.push(chunk);
      }
      if (crc32 && checksum !== entry.crc32) reject();
      if (xml) files.set(name, Buffer.concat(chunks));
    }
  } finally {
    zip.close();
  }
  return files;
}

type XmlHandlers = {
  open?: (tag: SaxesTagNS, parent: string | undefined) => void;
  text?: (text: string, tag: string | undefined) => void;
  close?: (tag: string, parent: string | undefined) => void;
};

function xmlReader(files: Map<string, Buffer>) {
  let elements = 0;
  return (path: string, root: string, namespaces: string[], handlers: XmlHandlers) => {
    const bytes = files.get(path);
    if (!bytes) reject();
    const parser = new SaxesParser({ xmlns: true });
    const stack: string[] = [];
    let namespace: string;
    parser.on("doctype", () => reject());
    parser.on("opentag", tag => {
      if (++elements > 500_000 || stack.length >= 64) reject("This workbook is too complex. Save a smaller copy and try again.");
      if (!stack.length) {
        if (tag.local !== root || !namespaces.includes(tag.uri)) reject();
        namespace = tag.uri;
      }
      const local = tag.uri === namespace ? tag.local : "";
      if (local) handlers.open?.(tag, stack.at(-1));
      stack.push(local);
    });
    const readText = (text: string) => handlers.text?.(text, stack.at(-1));
    parser.on("text", readText);
    parser.on("cdata", readText);
    parser.on("closetag", () => {
      const tag = stack.pop();
      if (tag) handlers.close?.(tag, stack.at(-1));
    });
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
    parser.write(new TextDecoder(encoding, { fatal: true }).decode(bytes)).close();
  };
}

const attr = (tag: SaxesTagNS, name: string) => tag.attributes[name]?.value;

function partTarget(base: string, target: string | undefined) {
  if (!target || /[\\:%?#]/.test(target)) reject();
  const part = target.startsWith("/") ? posix.normalize(target.slice(1)) : posix.join(posix.dirname(base), target);
  if (part === ".." || part.startsWith("../")) reject();
  return part;
}

const relationshipPart = (part: string) => posix.join(posix.dirname(part), "_rels", `${posix.basename(part)}.rels`);
const relationshipIs = (type: string, name: string) => RELATIONSHIP_NAMESPACES.some(uri => type === `${uri}/${name}`);
const decodeText = (text: string) => text.replace(/_x([a-f0-9]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

type Cell = { text: string } | { nonText: true };
type SheetRow = { row: number; cells: Cell[] };

function sharedStrings(read: ReturnType<typeof xmlReader>, path: string) {
  const strings: string[] = [];
  let value = "";
  let capture = false;
  read(path, "sst", SHEET_NAMESPACES, {
    open(tag, parent) {
      if (tag.local === "si" && parent === "sst") value = "";
      if (tag.local === "t" && (parent === "si" || parent === "r")) capture = true;
    },
    text(text, tag) { if (tag === "t" && capture) value += text; },
    close(tag, parent) {
      if (tag === "t") capture = false;
      if (tag === "si" && parent === "sst") strings.push(decodeText(value));
    },
  });
  return strings;
}

function worksheetRows(read: ReturnType<typeof xmlReader>, path: string, strings: string[]) {
  const rows: SheetRow[] = [];
  let row: SheetRow | undefined;
  let previousRow = 0;
  let previousColumn = 0;
  let cell: { column: number; type?: string; formula: boolean; raw?: string; text?: string } | undefined;
  let inline = false;
  read(path, "worksheet", SHEET_NAMESPACES, {
    open(tag, parent) {
      if (tag.local === "row" && parent === "sheetData") {
        const number = attr(tag, "r");
        const index = number === undefined ? previousRow + 1 : /^\d+$/.test(number) ? Number(number) : NaN;
        if (!Number.isSafeInteger(index) || index <= previousRow) reject();
        if (index > 2000) reject("Use a worksheet with data within the first 2,000 rows.");
        row = { row: index, cells: [] };
        previousRow = index;
        previousColumn = 0;
      }
      if (tag.local === "c" && parent === "row" && row) {
        const ref = attr(tag, "r");
        const address = ref === undefined ? undefined : /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(ref);
        if (ref !== undefined && (!address || Number(address[2]) !== row.row)) reject();
        const column = address ? Array.from(address[1]).reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) : previousColumn + 1;
        if (column <= previousColumn) reject();
        if (column > 64) reject("Use a worksheet with up to 64 columns.");
        previousColumn = column;
        cell = { column, type: attr(tag, "t"), formula: false };
      }
      if (!cell) return;
      if (tag.local === "f" && parent === "c") cell.formula = true;
      if (tag.local === "v" && parent === "c") cell.raw = "";
      if (tag.local === "t" && (parent === "is" || parent === "r")) {
        inline = true;
        cell.text ??= "";
      }
    },
    text(value, tag) {
      if (cell && tag === "v" && cell.raw !== undefined) cell.raw += value;
      if (cell && tag === "t" && inline) cell.text += value;
    },
    close(tag, parent) {
      if (tag === "t") inline = false;
      if (tag === "c" && parent === "row" && cell && row) {
        let text: string | undefined;
        if (!cell.formula && cell.type === "s") {
          if (cell.raw === undefined || !/^\d+$/.test(cell.raw)) reject();
          text = strings[Number(cell.raw)];
          if (text === undefined) reject();
        } else if (!cell.formula && cell.type === "inlineStr") {
          text = decodeText(cell.text ?? "");
        }
        if (text !== undefined) {
          if (text.trim()) row.cells[cell.column - 1] = { text };
        } else if (cell.formula || cell.raw || cell.type === "str" || cell.type === "e") {
          row.cells[cell.column - 1] = { nonText: true };
        }
        cell = undefined;
      }
      if (tag === "row" && parent === "sheetData" && row) {
        if (row.cells.length) rows.push(row);
        if (rows.length > 501) reject("Use up to 500 nonblank data rows in the selected worksheet.");
        row = undefined;
      }
    },
  });
  return rows;
}

function uiText(text: string, max: number) {
  return Array.from(text.replace(/[\p{Cc}\p{Cf}\uD800-\uDFFF]/gu, " ").trim()).slice(0, max).join("");
}

export async function readStudentWorkbook(bytes: Buffer, selection?: string) {
  const files = await workbookParts(bytes);
  const read = xmlReader(files);
  const workbookOverrides: string[] = [];
  read("[Content_Types].xml", "Types", [CONTENT_TYPES], {
    open(tag) {
      const type = attr(tag, "ContentType");
      if (/macroenabled|vba|externallink|activex/i.test(type ?? "")) reject("Save a copy without macros or external links.");
      if (tag.local === "Override" && type === workbookType) workbookOverrides.push(attr(tag, "PartName") ?? "");
    },
  });
  const relationships = new Map<string, Map<string, { type: string; target: string }>>();
  for (const path of files.keys()) {
    if (!path.toLowerCase().endsWith(".rels")) continue;
    const items = new Map<string, { type: string; target: string }>();
    relationships.set(path, items);
    read(path, "Relationships", [PACKAGE_RELS], { open(tag, parent) {
      if (tag.local !== "Relationship" || parent !== "Relationships") return;
      const mode = attr(tag, "TargetMode")?.toLowerCase();
      const type = attr(tag, "Type");
      const target = attr(tag, "Target");
      const id = attr(tag, "Id");
      if (mode && mode !== "internal" || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(target ?? "") || /externallink|vbaproject/i.test(type ?? "")) {
        reject("Save a copy without macros or external links.");
      }
      if (!id || !target || !type || items.has(id)) reject();
      items.set(id, { type, target });
    } });
  }
  const root = [...relationships.get("_rels/.rels")?.values() ?? []].find(item => relationshipIs(item.type, "officeDocument"));
  const workbook = partTarget("root", root?.target);
  if (!workbookOverrides.includes(`/${workbook}`)) reject();
  const links = relationships.get(relationshipPart(workbook));
  if (!links) reject();
  const sheets: { id: string; name: string; path: string }[] = [];
  read(workbook, "workbook", SHEET_NAMESPACES, { open(tag, parent) {
    if (tag.local === "externalReference") reject("Save a copy without external links.");
    if (tag.local !== "sheet" || parent !== "sheets") return;
    const state = attr(tag, "state") ?? "visible";
    if (state === "hidden" || state === "veryHidden") return;
    if (state !== "visible") reject();
    const id = Object.values(tag.attributes).find(value => value.local === "id" && RELATIONSHIP_NAMESPACES.includes(value.uri))?.value;
    const link = id ? links.get(id) : undefined;
    if (!link || !id || id.length > 120 || sheets.some(sheet => sheet.id === id)) reject();
    if (!relationshipIs(link.type, "worksheet")) return;
    const name = uiText(decodeText(attr(tag, "name") ?? ""), 31);
    if (!name) reject();
    sheets.push({ id, name, path: partTarget(workbook, link.target) });
  } });
  if (!sheets.length) reject("The workbook has no visible worksheets.");
  const choices = sheets.map(sheet => ({ id: sheet.id, name: sheet.name }));
  const sheet = selection === undefined && sheets.length === 1 ? sheets[0] : sheets.find(item => item.id === selection);
  if (!sheet) return { choices, selected: undefined };
  const shared = [...links.values()].find(item => relationshipIs(item.type, "sharedStrings"));
  const [header, ...rows] = worksheetRows(read, sheet.path, shared ? sharedStrings(read, partTarget(workbook, shared.target)) : []);
  if (!header || header.cells.some(cell => "nonText" in cell)) reject("Use nonblank text headings in the first nonblank worksheet row.");
  const headings = Array.from(header.cells, cell => cell && "text" in cell ? uiText(cell.text, 120) : "");
  return { choices, selected: { id: sheet.id, headings, rows } };
}

const fieldLabels: Record<StudentCsvField, string> = {
  studentCode: "Student ID", fullName: "Student Name", phone: "Phone", department: "Department", homeBatch: "Home Batch", audienceType: "Audience Type",
};

export function mapWorkbookRows(rows: SheetRow[], mapping: ReadonlyArray<StudentCsvField | null>): StudentInputRow[] {
  return rows.map((entry): StudentInputRow => {
    const nonText: string[] = [];
    const invalid: string[] = [];
    const values = Array.from(mapping, (field, index) => {
      const cell = entry.cells[index];
      if (!field || !cell) return "";
      if ("nonText" in cell) {
        nonText.push(fieldLabels[field]);
        return "";
      }
      if (/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(cell.text)) invalid.push(fieldLabels[field]);
      return cell.text;
    });
    if (nonText.length) return { row: entry.row, error: `Use text in ${nonText.join(", ")}. Use the original values, including any leading zeroes.` };
    if (invalid.length) return { row: entry.row, error: `Remove invalid characters from ${invalid.join(", ")}.` };
    return { row: entry.row, values };
  });
}

function escapeText(text: string) {
  return text.replace(/_x[0-9a-f]{4}_/gi, match => `_x005F_${match.slice(1)}`)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\r]/g, char => `_x${char.charCodeAt(0).toString(16).padStart(4, "0")}_`)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function writeStudentWorkbook(rows: readonly (readonly string[])[]) {
  const sheet = rows.map((row, index) => `<row r="${index + 1}">${row.map(text => `<c t="inlineStr"><is><t xml:space="preserve">${escapeText(text)}</t></is></c>`).join("")}</row>`).join("");
  const relationship = (type: string, target: string) => `<Relationships xmlns="${PACKAGE_RELS}"><Relationship Id="rId1" Type="${OFFICE_RELS}/${type}" Target="${target}"/></Relationships>`;
  const parts = {
    "[Content_Types].xml": `<Types xmlns="${CONTENT_TYPES}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${workbookType}"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": relationship("officeDocument", "xl/workbook.xml"),
    "xl/workbook.xml": `<workbook xmlns="${MAIN_NS}" xmlns:r="${OFFICE_RELS}"><sheets><sheet name="Students" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": relationship("worksheet", "worksheets/sheet1.xml"),
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${MAIN_NS}"><sheetData>${sheet}</sheetData></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)])),
    { mtime: new Date(2000, 0, 1) });
}
