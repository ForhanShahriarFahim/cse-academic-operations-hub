import { countsInSummary } from "./attendance-lifecycle";

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

function csvCells(line: string): string[] | null {
  const field = /[ 	]*(?:"((?:[^"]|"")*)"[ 	]*|([^",]*))(,|$)/y;
  const cells: string[] = [];
  while (true) {
    const match = field.exec(line);
    if (!match) return null;
    cells.push((match[1]?.replaceAll('""', '"') ?? match[2]).trim());
    if (!match[3]) return cells;
  }
}

export type StudentCsvField = keyof CsvStudentRow | "homeBatch";

const HEADER_ALIASES: Record<string, StudentCsvField> = {
  "studentid": "studentCode", "studentcode": "studentCode", "id": "studentCode",
  "studentsid": "studentCode", "roll": "studentCode", "rollno": "studentCode",
  "studentname": "fullName", "studentsname": "fullName", "name": "fullName", "fullname": "fullName",
  "phone": "phone", "phonenumber": "phone", "mobile": "phone", "mobilenumber": "phone",
  "department": "department", "dept": "department", "homedepartment": "department",
  "homebatch": "homeBatch", "batch": "homeBatch", "cohort": "homeBatch",
  "audiencetype": "audienceType", "studenttype": "audienceType",
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface RosterCsvIssue {
  row: number;
  kind: "skipped" | "failed";
  message: string;
}

export interface RosterImportReceipt {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  issues: RosterCsvIssue[];
}

export type ParsedRosterRow = Omit<CsvStudentRow, "audienceType"> & { row: number; homeBatch?: string; audienceType: CsvStudentRow["audienceType"] | null };
export type StudentInputRow = { row: number; values: string[] } | { row: number; error: string };

export function studentCsvHeadings(text: string) {
  const header = text.replace(/^\uFEFF/, "").split(/\r?\n/).find(line => line.trim());
  return header ? csvCells(header) : null;
}

export function suggestedStudentCsvField(label: string) {
  const key = normalizeHeader(label);
  return Object.hasOwn(HEADER_ALIASES, key) ? HEADER_ALIASES[key] : null;
}

export function parseStudentCsv(text: string, mapping?: ReadonlyArray<StudentCsvField | null>): { error: string } | { rows: ParsedRosterRow[]; issues: RosterCsvIssue[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
    .map((line, index) => ({ line, row: index + 1 })).filter(({ line }) => line.trim());
  if (lines.length < 2) return { error: "CSV needs a header row and at least one student row." } as const;
  const headings = csvCells(lines[0].line);
  if (mapping && headings?.length !== mapping.length) return { error: "Map the columns in the selected file." };
  const headers = mapping ?? headings?.map(suggestedStudentCsvField);
  if (!headers?.includes("studentCode") || !headers.includes("fullName")) {
    return { error: "CSV must include valid Student ID and Student Name headings." } as const;
  }
  const known = headers.filter((header) => header !== null);
  if (new Set(known).size !== known.length) return { error: "Use each supported CSV heading only once." } as const;

  return parseStudentRows(headers, lines.slice(1).map(({ line, row }) => {
    const values = csvCells(line);
    if (!values || values.length > headers.length) return { row, error: "Check CSV quotes and the number of columns." };
    if (line.includes("\0")) return { row, error: "Remove invalid characters." };
    return { row, values };
  }));
}

export function parseStudentRows(headers: ReadonlyArray<StudentCsvField | null>, input: StudentInputRow[]) {
  const rows: ParsedRosterRow[] = [];
  const issues: RosterCsvIssue[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    const { row } = entry;
    if ("error" in entry) {
      issues.push({ row, kind: "failed", message: entry.error });
      continue;
    }
    const draft = Object.fromEntries(headers.flatMap((header, index) => header ? [[header, entry.values[index]?.trim() ?? ""]] : []));
    const { studentCode, fullName, phone, department } = draft;
    const audience = draft.audienceType?.toLowerCase() || null;
    if (!studentCode || !fullName) {
      issues.push({ row, kind: "failed", message: "Student ID and Student Name are required." });
    } else if (audience !== null && audience !== "local" && audience !== "external" && audience !== "merged") {
      issues.push({ row, kind: "failed", message: "Audience Type must be local, external or merged." });
    } else if (seen.has(studentCode)) {
      issues.push({ row, kind: "skipped", message: "Duplicate Student ID in this file." });
    } else {
      seen.add(studentCode);
      rows.push({ row, studentCode, fullName, phone: phone || null, department: department || null, audienceType: audience, ...(draft.homeBatch ? { homeBatch: draft.homeBatch } : {}) });
    }
  }
  return { rows, issues } as const;
}

export const ATTENDANCE_CALCULATION = "Divide attended sessions by eligible sessions and multiply by the policy maximum. Round the mark to two decimals and the percentage separately to one decimal, rounding half steps up.";
export const ATTENDANCE_PHASES = ["semester", "midterm", "final"] as const;
export type AttendancePhase = typeof ATTENDANCE_PHASES[number];
export const ATTENDANCE_PHASE_LABELS = { semester: "Semester", midterm: "Midterm", final: "Final" } as const;

export function attendanceContribution(sessionState: string, recordedStatus: string | null) {
  const attended = recordedStatus === "present" || recordedStatus === "late";
  if (!countsInSummary(sessionState)) return { attended: 0, total: 0, explanation: "Voided session" };
  if (recordedStatus == null) return { attended: 0, total: 0, explanation: "Student was not captured" };
  if (recordedStatus === "excused") return { attended: 0, total: 0, explanation: "Excused" };
  return { attended: Number(attended), total: 1, explanation: attended ? "+1 attended, +1 eligible" : "+1 eligible" };
}

export function attendanceMarkFromCounts(attended: number, total: number, maximum: number): number {
  return total ? Math.round((attended / total) * maximum * 100) / 100 : 0;
}

export function attendanceResult(attended: number, total: number, maximum: number | null) {
  return {
    attended, total,
    percentage: total ? Math.round(attended / total * 1000) / 10 : null,
    mark: maximum == null ? null : attendanceMarkFromCounts(attended, total, maximum),
  };
}

const totals = (statuses: readonly string[]) => statuses.reduce((sum, status) => {
  const contribution = attendanceContribution("submitted", status);
  return { attended: sum.attended + contribution.attended, total: sum.total + contribution.total };
}, { attended: 0, total: 0 });

export function attendanceMark(statuses: AttendanceStatus[], maximum: number): number {
  const { attended, total } = totals(statuses);
  return attendanceMarkFromCounts(attended, total, maximum);
}

export interface AttendanceSessionInput {
  phase: string;
  records: ReadonlyArray<{ studentId: number; status: string }>;
}

/** A session applies only to its captured students; missing records are not absences. */
export function summarizeAttendance(studentId: number, sessions: readonly AttendanceSessionInput[], maximum: number) {
  const statusesFor = (phase?: "midterm" | "final"): AttendanceStatus[] => sessions
    .filter((session) => !phase || session.phase === phase)
    .flatMap((session) => {
      const record = session.records.find((record) => record.studentId === studentId);
      return record ? [record.status as AttendanceStatus] : [];
    });
  const semester = statusesFor();
  const { attended, total } = totals(semester);
  const { percentage, mark } = attendanceResult(attended, total, maximum);
  return {
    studentId,
    midterm: totals(statusesFor("midterm")),
    final: totals(statusesFor("final")),
    semester: { attended, total, percentage: percentage ?? 0 },
    mark: mark ?? 0,
    maximum,
  };
}

