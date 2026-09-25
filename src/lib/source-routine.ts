export type SourceStream = "HSC" | "DIPLOMA";

export interface SourceTeacher {
  shortCode: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  designation: string | null;
  departmentCode: string;
  status: "active" | "vacancy" | "unresolved";
}

export interface SourceCourse {
  code: string;
  title: string;
  semester: number;
  catalogCredits: number;
  workloadCreditHours: number;
  courseType: "theory" | "sessional" | "thesis";
}

export interface SourceMeeting {
  stream: SourceStream;
  batchLabel: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  courseCode: string;
  teacherCodes: string[];
  roomCodes: string[];
  externalAudienceLabel: string | null;
  customTimeLabel: string | null;
  sourceCell: string;
  sourceException: boolean;
}

export interface SourceExternalCommitment {
  stream: SourceStream;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  roomCodes: string[];
  counterpartLabel: string;
  sourceCell: string;
}

export interface SourceClassRepresentative {
  stream: SourceStream;
  batchLabel: string;
  name: string | null;
  phone: string | null;
}

export interface SourceQueryContact {
  name: string;
  designation: string;
  phone: string;
}

export interface Summer2026Manifest {
  teachers: SourceTeacher[];
  courses: SourceCourse[];
  meetings: SourceMeeting[];
  externalCommitments: SourceExternalCommitment[];
  classRepresentatives: SourceClassRepresentative[];
  queryContacts: SourceQueryContact[];
  reconciliations: string[];
}

const DAY_NUMBER: Record<string, number> = {
  SATURDAY: 0,
  SUNDAY: 1,
  MONDAY: 2,
  TUESDAY: 3,
  WEDNESDAY: 4,
  THURSDAY: 5,
  FRIDAY: 6,
};

const SEMESTER_BY_HEADING: Record<string, number> = {
  "1st Year 1st Semester": 1,
  "1st Year 2nd Semester": 2,
  "2nd Year 1st Semester": 3,
  "2nd Year 2nd Semester": 4,
  "3rd Year 1st Semester": 5,
  "3rd Year 2nd Semester": 6,
  "4th Year 1st Semester": 7,
  "4th Year 2nd Semester": 8,
};

function clean(value: string): string {
  return value
    .replace(/\\([+*_.-])/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)]\(mailto:[^)]+\)/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tableCells(line: string): string[] {
  const raw = line.split("|");
  return raw.slice(1, raw.length - 1).map(clean);
}

function section(markdown: string, start: string, end?: string): string {
  const startAt = markdown.indexOf(start);
  if (startAt < 0) return "";
  const endAt = end ? markdown.indexOf(end, startAt + start.length) : -1;
  return markdown.slice(startAt, endAt < 0 ? undefined : endAt);
}

function canonicalCourseCode(value: string): string {
  return value.replace(/\s+/, "-").replace(/\s/g, "").toUpperCase();
}

function departmentFor(shortCode: string, descriptor: string): string {
  if (["MJ", "MHK", "SI"].includes(shortCode)) return "MATH";
  if (["MRA", "MRI"].includes(shortCode)) return "PHY";
  if (["DSR"].includes(shortCode)) return "CHEM";
  if (["RIC", "MAS", "SSI", "AR", "AHS", "HUH"].includes(shortCode)) return "EEE";
  if (["SHM", "IMN", "RRR"].includes(shortCode)) return "CE";
  if (["AAM", "APR", "AP"].includes(shortCode)) return "ENG";
  if (["MAR", "BNR", "JR"].includes(shortCode)) return "BA";
  if (["SA", "MNI"].includes(shortCode)) return "BAN";
  if (["MR", "IAZ"].includes(shortCode)) return "EDU";
  if (shortCode === "JH") return "LAW";
  if (descriptor.includes("EEE")) return "EEE";
  if (descriptor.includes("CE")) return "CE";
  return "CSE";
}

function parseTeachers(markdown: string): SourceTeacher[] {
  const text = section(markdown, "# SECTION 4: List of Teachers", "# SECTION 5:");
  const teachers: SourceTeacher[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/^\|\s*\d+/.test(line)) continue;
    const cells = tableCells(line);
    if (cells.length < 5) continue;
    const descriptor = cells[1];
    const shortCode = cells[2];
    const parenthetical = descriptor.match(/\(([^)]+)\)\s*$/)?.[1] ?? null;
    const fullName = descriptor.replace(/\s*\([^)]+\)\s*$/, "").trim();
    const email = cells[4] === "—" || cells[4] === "-" ? null : cells[4];
    const phone = cells[3] === "—" || cells[3] === "-" ? null : cells[3];
    teachers.push({
      shortCode,
      fullName,
      phone,
      email,
      designation: parenthetical,
      departmentCode: departmentFor(shortCode, descriptor),
      status: shortCode === "UT" ? "vacancy" : "active",
    });
  }
  return teachers;
}

function parseCourses(markdown: string): SourceCourse[] {
  const text = section(markdown, "# SECTION 3:", "# SECTION 4:");
  const headings = Object.keys(SEMESTER_BY_HEADING);
  const courses: SourceCourse[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const startAt = text.indexOf(`### ${heading}`);
    if (startAt < 0) continue;
    const nextLocations = headings
      .slice(index + 1)
      .map((next) => text.indexOf(`### ${next}`, startAt + heading.length))
      .filter((position) => position >= 0);
    const endAt = nextLocations.length > 0 ? Math.min(...nextLocations) : text.length;
    const block = text.slice(startAt, endAt);
    const pattern = /\|\s*([A-Z]{2,4}\s+\d{4}(?:\([A-Z]\))?)\s*\|\s*([^|]+?)\s*\|\s*([0-9]+(?:\.[0-9]+)?)\s*\|/g;
    for (const match of block.matchAll(pattern)) {
      const title = clean(match[2]);
      const catalogCredits = Number(match[3]);
      const courseType = /sessional/i.test(title)
        ? "sessional"
        : /thesis|project work/i.test(title)
          ? "thesis"
          : "theory";
      courses.push({
        code: canonicalCourseCode(match[1]),
        title,
        semester: SEMESTER_BY_HEADING[heading],
        catalogCredits,
        workloadCreditHours: courseType === "sessional" ? 2 : catalogCredits,
        courseType,
      });
    }
  }
  return courses;
}

function toMinutes(hour: number, minute: number, meridiem: string): number {
  const normalizedHour = hour % 12 + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  return normalizedHour * 60 + minute;
}

function parseTimeRange(value: string): { start: number; end: number; label: string } | null {
  const match = clean(value).match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  return {
    start: toMinutes(Number(match[1]), Number(match[2]), match[3]),
    end: toMinutes(Number(match[4]), Number(match[5]), match[6]),
    label: match[0],
  };
}

function parseRoomCodes(value: string): string[] {
  const codes: string[] = [];
  for (const match of clean(value).matchAll(/NB-\s*(\d{3})(?:\/(\d{3}))?/g)) {
    codes.push(`NB-${match[1]}`);
    if (match[2]) codes.push(`NB-${match[2]}`);
  }
  return [...new Set(codes)];
}

function parseAudience(value: string): string | null {
  const matches = [...clean(value).matchAll(/\(([^)]+)\)/g)].map((match) => match[1]);
  const audience = matches.find((item) => /CSE.*(?:EEE|CE|DIP)|HSC.*DIP/i.test(item));
  return audience ? audience.replace(/\s+/g, " ") : null;
}

function parseMeetings(markdown: string, knownTeachers: Set<string>) {
  const lines = markdown.split(/\r?\n/);
  let stream: SourceStream | null = null;
  let headerTimes: Array<{ start: number; end: number; label: string } | null> = [];
  let currentDay: number | null = null;
  const meetings: SourceMeeting[] = [];
  const externalCommitments: SourceExternalCommitment[] = [];
  const reconciliations: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# SECTION 1:")) stream = "HSC";
    if (line.startsWith("# SECTION 2:")) stream = "DIPLOMA";
    if (line.startsWith("# SECTION 3:")) stream = null;
    if (!stream || !line.startsWith("|")) continue;

    const cells = tableCells(line);
    if (cells[0]?.toLowerCase() === "day" && cells[1]?.toLowerCase() === "batch") {
      headerTimes = cells.map((cell, index) => index < 2 ? null : parseTimeRange(cell));
      currentDay = null;
      continue;
    }
    if (cells[0]?.startsWith(":----") || cells[1]?.startsWith(":----")) continue;
    if (cells.length < 3) continue;

    const dayText = cells[0]?.replace(/\s/g, "").toUpperCase();
    if (dayText && DAY_NUMBER[dayText] != null) currentDay = DAY_NUMBER[dayText];
    if (currentDay == null) continue;

    const batchCell = cells[1]?.replace(/\s/g, "").toUpperCase();
    if (!batchCell) continue;

    for (let cellIndex = 2; cellIndex < cells.length; cellIndex += 1) {
      const sourceCell = cells[cellIndex];
      if (!sourceCell || sourceCell === "—" || sourceCell === "~" || /Combined with/i.test(sourceCell)) continue;
      const fallbackTime = headerTimes[cellIndex];
      const explicitTime = parseTimeRange(sourceCell);
      const time = explicitTime ?? fallbackTime;
      if (!time) continue;

      if (batchCell === "OD") {
        const roomCodes = parseRoomCodes(sourceCell);
        if (roomCodes.length === 0) continue;
        const counterpartLabel = sourceCell.match(/\(([^)]+)\)/)?.[1] ?? "Other Department";
        externalCommitments.push({
          stream,
          dayOfWeek: currentDay,
          startMinutes: time.start,
          endMinutes: time.end,
          roomCodes,
          counterpartLabel,
          sourceCell,
        });
        continue;
      }

      const courseMatch = sourceCell.match(/\b([A-Z]{2,4}-\d{4}(?:\([A-Z]\))?)/);
      if (!courseMatch) {
        if (parseRoomCodes(sourceCell).length > 0) {
          reconciliations.push(`${stream} ${batchCell.replace("B", "B")} ${Object.keys(DAY_NUMBER).find((day) => DAY_NUMBER[day] === currentDay)?.toLowerCase()} ${time.label}: source cell has a room but no course (${sourceCell}).`);
        }
        continue;
      }

      const afterCourse = sourceCell.slice((courseMatch.index ?? 0) + courseMatch[0].length);
      const teacherLabel = afterCourse.match(/^\s*\(([^)]+)\)/)?.[1] ?? "";
      const teacherCodes = teacherLabel
        .split("/")
        .map((code) => code.trim().toUpperCase())
        .filter((code) => code && code !== "UT");
      for (const code of teacherCodes) {
        if (!knownTeachers.has(code)) reconciliations.push(`Teacher code ${code} appears in the routine but has no teacher-directory name.`);
      }

      meetings.push({
        stream,
        batchLabel: batchCell,
        dayOfWeek: currentDay,
        startMinutes: time.start,
        endMinutes: time.end,
        courseCode: canonicalCourseCode(courseMatch[1]),
        teacherCodes,
        roomCodes: parseRoomCodes(sourceCell),
        externalAudienceLabel: parseAudience(sourceCell),
        customTimeLabel: explicitTime ? explicitTime.label : null,
        sourceCell,
        sourceException: false,
      });
    }
  }

  // The source places four HSC-25B classes on Friday. Institutional policy
  // for this import is Saturday-Tuesday, so retain the source evidence while
  // placing those four occurrences into conflict-checkable approved slots.
  const friday25 = meetings.filter((item) => item.stream === "HSC" && item.batchLabel === "25B" && item.dayOfWeek === 6);
  const replacement: Record<string, Pick<SourceMeeting, "dayOfWeek" | "startMinutes" | "endMinutes"> & { roomCodes?: string[] }> = {
    "LAW-3201": { dayOfWeek: 3, startMinutes: 540, endMinutes: 600, roomCodes: ["NB-505"] },
    "CSE-3103": { dayOfWeek: 3, startMinutes: 600, endMinutes: 660 },
    "CSE-2205": { dayOfWeek: 3, startMinutes: 720, endMinutes: 795 },
    "CSE-2206": { dayOfWeek: 3, startMinutes: 810, endMinutes: 885 },
  };
  const activeMeetings = meetings.filter((item) => !(item.stream === "HSC" && item.batchLabel === "25B" && item.dayOfWeek === 6));
  for (const original of friday25) {
    const slot = replacement[original.courseCode];
    if (!slot) {
      reconciliations.push(`HSC 25B Friday source meeting ${original.courseCode} has no approved Saturday-Tuesday replacement.`);
      continue;
    }
    activeMeetings.push({
      ...original,
      ...slot,
      customTimeLabel: "Rescheduled from source Friday row",
      sourceException: true,
    });
    reconciliations.push(`HSC 25B ${original.courseCode} moved from Friday to the approved Saturday-Tuesday operating window.`);
  }

  // The Markdown transcription shifts the first Diploma-Friday column one row
  // upward. The supplied PDF is visually unambiguous, so correct those four
  // cells while retaining a reconciliation note for auditability.
  const diplomaFridayCorrections: Record<string, string> = {
    "PHY-1202": "22B",
    "MTH-2101": "21B",
    "CSE-2104": "20B",
    "LAW-3201": "19B",
  };
  for (const meeting of activeMeetings) {
    if (meeting.stream !== "DIPLOMA" || meeting.dayOfWeek !== 6 || meeting.startMinutes !== 540) continue;
    const correctedBatch = diplomaFridayCorrections[meeting.courseCode];
    if (!correctedBatch) continue;
    if (meeting.batchLabel !== correctedBatch) {
      reconciliations.push(`Diploma Friday 9:00 AM ${meeting.courseCode} batch corrected from Markdown ${meeting.batchLabel} to PDF ${correctedBatch}.`);
      meeting.batchLabel = correctedBatch;
    }
  }

  return {
    meetings: activeMeetings,
    externalCommitments,
    reconciliations: [...new Set(reconciliations)],
  };
}

function parseClassRepresentatives(markdown: string): SourceClassRepresentative[] {
  const text = section(markdown, "# SECTION 5:", "# SECTION 6:");
  const representatives: SourceClassRepresentative[] = [];
  let stream: SourceStream | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.includes("B.Sc. in CSE (HSC)")) stream = "HSC";
    if (line.includes("B.Sc. in CSE (Diploma)")) stream = "DIPLOMA";
    if (!stream || !/^\|\s*\d+/.test(line)) continue;
    const cells = tableCells(line);
    if (cells.length < 3) continue;
    const batchNumber = cells[0].match(/\d+/)?.[0];
    if (!batchNumber) continue;
    representatives.push({
      stream,
      batchLabel: `${batchNumber}B`,
      name: cells[1] && !cells[1].includes("Not listed") ? cells[1] : null,
      phone: cells[2] && cells[2] !== "—" ? cells[2] : null,
    });
  }
  return representatives;
}

function parseQueryContacts(markdown: string): SourceQueryContact[] {
  const text = section(markdown, "# SECTION 6:");
  const contacts: SourceQueryContact[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("| **")) continue;
    const cells = tableCells(line);
    if (cells.length < 3) continue;
    contacts.push({
      name: cells[0],
      designation: cells[1],
      phone: cells[2],
    });
  }
  return contacts;
}

export function parseSummer2026Routine(markdown: string): Summer2026Manifest {
  const teachers = parseTeachers(markdown);
  const knownTeachers = new Set(teachers.map((teacher) => teacher.shortCode));
  const routine = parseMeetings(markdown, knownTeachers);
  return {
    teachers,
    courses: parseCourses(markdown),
    meetings: routine.meetings,
    externalCommitments: routine.externalCommitments,
    classRepresentatives: parseClassRepresentatives(markdown),
    queryContacts: parseQueryContacts(markdown),
    reconciliations: routine.reconciliations,
  };
}
