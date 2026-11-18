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

type ParsedRosterRow = Omit<CsvStudentRow, "audienceType"> & { row: number; audienceType: CsvStudentRow["audienceType"] | null };

export function parseStudentCsv(text: string): { error: string } | { rows: ParsedRosterRow[]; issues: RosterCsvIssue[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
    .map((line, index) => ({ line, row: index + 1 })).filter(({ line }) => line.trim());
  if (lines.length < 2) return { error: "CSV needs a header row and at least one student row." } as const;
  const headers = csvCells(lines[0].line)?.map((header) => {
    const key = normalizeHeader(header);
    return Object.hasOwn(HEADER_ALIASES, key) ? HEADER_ALIASES[key] : null;
  });
  if (!headers?.includes("studentCode") || !headers.includes("fullName")) {
    return { error: "CSV must include valid Student ID and Student Name headings." } as const;
  }
  const known = headers.filter((header) => header !== null);
  if (new Set(known).size !== known.length) return { error: "Use each supported CSV heading only once." } as const;

  const rows: ParsedRosterRow[] = [];
  const issues: RosterCsvIssue[] = [];
  const seen = new Set<string>();
  for (const { line, row } of lines.slice(1)) {
    const values = csvCells(line);
    if (!values || values.length > headers.length) {
      issues.push({ row, kind: "failed", message: "Check CSV quotes and the number of columns." });
      continue;
    }
    const draft = Object.fromEntries(headers.flatMap((header, index) => header ? [[header, values[index] ?? ""]] : []));
    const { studentCode, fullName, phone, department } = draft;
    const audience = draft.audienceType?.toLowerCase() || null;
    if (!studentCode || !fullName || line.includes("\0")) {
      issues.push({ row, kind: "failed", message: line.includes("\0") ? "Remove invalid characters." : "Student ID and Student Name are required." });
    } else if (audience !== null && audience !== "local" && audience !== "external" && audience !== "merged") {
      issues.push({ row, kind: "failed", message: "Audience Type must be local, external or merged." });
    } else if (seen.has(studentCode)) {
      issues.push({ row, kind: "skipped", message: "Duplicate Student ID in this file." });
    } else {
      seen.add(studentCode);
      rows.push({ row, studentCode, fullName, phone: phone || null, department: department || null, audienceType: audience });
    }
  }
  return { rows, issues } as const;
}

/** Late counts as attended; excused sessions are removed from the denominator. */
export function attendanceMark(statuses: AttendanceStatus[], maximum: number): number {
  const counted = statuses.filter((status) => status !== "excused");
  if (counted.length === 0) return 0;
  const attended = counted.filter((status) => status === "present" || status === "late").length;
  return Math.round((attended / counted.length) * maximum * 100) / 100;
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
  const totals = (statuses: AttendanceStatus[]) => ({
    attended: statuses.filter((status) => status === "present" || status === "late").length,
    total: statuses.filter((status) => status !== "excused").length,
  });
  const semester = statusesFor();
  const { attended, total } = totals(semester);
  return {
    studentId,
    midterm: totals(statusesFor("midterm")),
    final: totals(statusesFor("final")),
    semester: { attended, total, percentage: total ? Math.round(attended / total * 1000) / 10 : 0 },
    mark: attendanceMark(semester, maximum),
    maximum,
  };
}

