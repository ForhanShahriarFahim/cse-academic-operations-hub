export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface CsvStudentRow {
  studentCode: string;
  fullName: string;
  phone: string | null;
  department: string | null;
  audienceType: "local" | "external" | "merged";
}

export interface AttendanceSummaryInput {
  studentId: number;
  phase: "midterm" | "final";
  status: AttendanceStatus;
}

function csvCells(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(value.trim()); value = "";
    } else value += ch;
  }
  cells.push(value.trim());
  return cells;
}

const HEADER_ALIASES: Record<string, keyof Omit<CsvStudentRow, "audienceType"> | "audienceType"> = {
  "studentid": "studentCode", "studentcode": "studentCode", "id": "studentCode",
  "studentsid": "studentCode", "roll": "studentCode", "rollno": "studentCode",
  "studentname": "fullName", "studentsname": "fullName", "name": "fullName", "fullname": "fullName",
  "phone": "phone", "phonenumber": "phone", "mobile": "phone", "mobilenumber": "phone",
  "department": "department", "dept": "department", "homedepartment": "department",
  "audiencetype": "audienceType", "studenttype": "audienceType",
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Parse a small roster CSV without binding the import surface to one export format. */
export function parseStudentCsv(text: string): CsvStudentRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one student row.");
  const headers = csvCells(lines[0]).map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? null);
  if (!headers.includes("studentCode") || !headers.includes("fullName")) {
    throw new Error("CSV must include Student ID and Student Name columns.");
  }
  const rows: CsvStudentRow[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const values = csvCells(line);
    const draft: Record<string, string> = {};
    headers.forEach((header, i) => { if (header) draft[header] = values[i]?.trim() ?? ""; });
    const studentCode = draft.studentCode?.trim();
    const fullName = draft.fullName?.trim();
    if (!studentCode && !fullName) continue;
    if (!studentCode || !fullName) throw new Error(`Every row needs Student ID and Student Name (${line}).`);
    if (seen.has(studentCode)) continue;
    seen.add(studentCode);
    const rawType = draft.audienceType?.toLowerCase();
    const audienceType = rawType === "external" || rawType === "merged" ? rawType : "local";
    rows.push({
      studentCode,
      fullName,
      phone: draft.phone || null,
      department: draft.department || null,
      audienceType,
    });
  }
  if (rows.length === 0) throw new Error("No valid student rows were found.");
  return rows;
}

/** Late counts as attended; excused sessions are removed from the denominator. */
export function attendanceMark(statuses: AttendanceStatus[], maximum: number): number {
  const counted = statuses.filter((status) => status !== "excused");
  if (counted.length === 0) return 0;
  const attended = counted.filter((status) => status === "present" || status === "late").length;
  return Math.round((attended / counted.length) * maximum * 100) / 100;
}

