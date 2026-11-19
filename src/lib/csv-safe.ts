/**
 * Private-output CSV encoding shared by roster (STU-01B) and ledger (ATT-05)
 * exports. Every cell is quoted; text a spreadsheet could run as a formula,
 * including after leading spaces, control or zero-width characters and
 * full-width operators, is prefixed with an apostrophe so it stays text.
 */
export function safeCsvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  const safe = typeof value === "string" && /^[\s\u0000-\u001f\u200b-\u200f\ufeff]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** UTF-8 byte order mark, quoted cells and CRLF rows. */
export function safeCsv(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>) {
  return "\uFEFF" + rows.map(row => row.map(safeCsvCell).join(",")).join("\r\n") + "\r\n";
}
