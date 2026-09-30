/**
 * Routine builder workbench helpers (UX-01 amendment A). Pure functions shared
 * by the builder UI and its checks: candidate classes, the live pre-check with
 * the real conflict engine, teacher/room availability, grid cell spans, and
 * where an unplaced group fits. The server remains authoritative on save.
 */
import { analyzeSchedule, type BreakRule, type Issue, type PermittedWindow } from "./conflicts";
import { knownAudienceSize as audienceSizeOf, type ExternalCommitmentView, type MeetingView, type RoomRef, type TeacherRef } from "./serialize";
import { fmtRange, overlaps } from "./time";

/** Everything about a teaching group needed to place a new class, without a time or staff. */
export type GroupTemplate = Omit<MeetingView, "id" | "dayOfWeek" | "startMinutes" | "endMinutes" | "teachers" | "rooms">;

export interface WorkbenchTeacher {
  id: number; shortCode: string; fullName: string; homeDepartmentCode: string | null; designation: string | null;
}
export interface WorkbenchRoom {
  id: number; code: string; building: string; roomType: string; capabilities: string[]; capacity: number | null;
  owningDepartmentCode: string | null;
}

export interface EngineContext {
  meetings: MeetingView[];
  externals: ExternalCommitmentView[];
  breaks: BreakRule[];
  windows: PermittedWindow[];
}

export interface Placement {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  teacherIds: number[];
  roomIds: number[];
  isException: boolean;
  exceptionNote: string | null;
}

export const NEW_MEETING_ID = -1;

const teacherRef = (t: WorkbenchTeacher, role = "instructor"): TeacherRef => ({
  id: t.id, shortCode: t.shortCode, fullName: t.fullName, homeDepartmentCode: t.homeDepartmentCode,
  designation: t.designation, isExternalCse: t.homeDepartmentCode !== "CSE", role,
});
const roomRef = (r: WorkbenchRoom): RoomRef => ({
  id: r.id, code: r.code, building: r.building, roomType: r.roomType, capabilities: r.capabilities, capacity: r.capacity,
});

/** A class as it would be after the proposed placement (an existing class keeps its id and teacher roles). */
export function candidateMeeting(
  base: MeetingView | GroupTemplate,
  placement: Placement,
  teachers: WorkbenchTeacher[],
  rooms: WorkbenchRoom[],
): MeetingView {
  const existing = "id" in base ? base : null;
  const roleOf = new Map(existing?.teachers.map((t) => [t.id, t.role]) ?? []);
  return {
    ...(base as MeetingView),
    id: existing?.id ?? NEW_MEETING_ID,
    dayOfWeek: placement.dayOfWeek,
    startMinutes: placement.startMinutes,
    endMinutes: placement.endMinutes,
    isException: placement.isException,
    exceptionNote: placement.exceptionNote,
    teachers: teachers.filter((t) => placement.teacherIds.includes(t.id)).map((t) => teacherRef(t, roleOf.get(t.id))),
    rooms: rooms.filter((r) => placement.roomIds.includes(r.id)).map(roomRef),
  };
}

/** Issues the candidate would cause, using the same engine as the server. */
export function precheck(candidate: MeetingView, context: EngineContext): Issue[] {
  return analyzeSchedule({
    meetings: [...context.meetings.filter((m) => m.id !== candidate.id), candidate],
    externals: context.externals,
    breaks: context.breaks,
    windows: context.windows,
  }).filter((issue) => issue.meetingIds.includes(candidate.id));
}

export type Availability =
  | { state: "free"; note?: string }
  | { state: "busy"; detail: string }
  | { state: "external"; detail: string }
  | { state: "check"; detail: string };

function busyWith(meetings: MeetingView[], day: number, start: number, end: number, exceptId: number, uses: (m: MeetingView) => boolean) {
  return meetings.find((m) => m.id !== exceptId && m.dayOfWeek === day && overlaps(m.startMinutes, m.endMinutes, start, end) && uses(m));
}
const audienceText = (m: MeetingView) => m.audiences.map((a) => `${a.stream === "HSC" ? "HSC" : "DIP"}-${a.batchLabel}`).join(" + ");

export function teacherAvailability(teacherId: number, day: number, start: number, end: number, context: EngineContext, exceptId: number): Availability {
  const clash = busyWith(context.meetings, day, start, end, exceptId, (m) => m.teachers.some((t) => t.id === teacherId));
  if (clash) return { state: "busy", detail: `${clash.courseCode} · ${audienceText(clash)}` };
  const external = context.externals.find((e) => e.teacherId === teacherId && e.dayOfWeek === day
    && e.startMinutes != null && e.endMinutes != null && overlaps(e.startMinutes, e.endMinutes, start, end));
  if (external) return { state: "external", detail: `${external.counterpartDepartment} · ${fmtRange(external.startMinutes!, external.endMinutes!)}` };
  return { state: "free" };
}

export function roomAvailability(
  room: WorkbenchRoom, day: number, start: number, end: number, context: EngineContext, exceptId: number, audienceSize: number | null,
): Availability {
  const clash = busyWith(context.meetings, day, start, end, exceptId, (m) => m.rooms.some((r) => r.id === room.id));
  if (clash) return { state: "busy", detail: `${clash.courseCode} · ${audienceText(clash)}` };
  const external = context.externals.find((e) => e.roomId === room.id && e.dayOfWeek === day
    && e.startMinutes != null && e.endMinutes != null && overlaps(e.startMinutes, e.endMinutes, start, end));
  if (external) return { state: "external", detail: `${external.counterpartDepartment} booking · ${fmtRange(external.startMinutes!, external.endMinutes!)}` };
  if (room.capacity == null) {
    return audienceSize == null ? { state: "free", note: "Seats not recorded" } : { state: "check", detail: `Seats not recorded; class of ${audienceSize}` };
  }
  if (audienceSize != null && audienceSize > room.capacity) return { state: "busy", detail: `Seats ${room.capacity}, class ${audienceSize}` };
  return { state: "free" };
}

/** Rooms offered for a class: a required capability (for example a lab) filters the list. */
export function suitableRooms(rooms: WorkbenchRoom[], requiredCapability: string | null, courseType: string): WorkbenchRoom[] {
  const needs = requiredCapability ?? (courseType === "sessional" ? "lab" : null);
  return needs ? rooms.filter((r) => r.roomType === needs || r.capabilities.includes(needs)) : rooms;
}

/** Known total audience, or null when any part is unknown (same rule as the conflict engine). */
export function knownAudienceSize(m: MeetingView | GroupTemplate): number | null {
  return audienceSizeOf(m as MeetingView);
}

export interface SlotColumn { start: number; end: number }

export interface GridCell {
  /** Index of the first slot this cell covers. */
  first: number;
  /** Index of the last slot this cell covers (inclusive). */
  last: number;
  meetings: MeetingView[];
}

/**
 * Cells for one batch row: each class spans the slot columns it overlaps.
 * Classes whose spans overlap share one cell; a class outside every slot is
 * placed at the nearest slot by start time, and its card shows the exact time.
 */
export function rowCells(meetings: MeetingView[], slots: SlotColumn[]): GridCell[] {
  const ranges = meetings.map((m) => {
    const hit = slots.map((s, i) => (overlaps(m.startMinutes, m.endMinutes, s.start, s.end) ? i : -1)).filter((i) => i >= 0);
    if (hit.length) return { m, first: hit[0], last: hit[hit.length - 1] };
    let nearest = 0;
    slots.forEach((s, i) => { if (Math.abs(s.start - m.startMinutes) < Math.abs(slots[nearest].start - m.startMinutes)) nearest = i; });
    return { m, first: nearest, last: nearest };
  }).sort((a, b) => a.first - b.first || a.m.startMinutes - b.m.startMinutes);

  const cells: GridCell[] = [];
  for (const range of ranges) {
    const current = cells[cells.length - 1];
    if (current && range.first <= current.last) {
      current.meetings.push(range.m);
      current.last = Math.max(current.last, range.last);
    } else {
      cells.push({ first: range.first, last: range.last, meetings: [range.m] });
    }
  }
  const filled: GridCell[] = [];
  let next = 0;
  for (const cell of cells) {
    for (; next < cell.first; next++) filled.push({ first: next, last: next, meetings: [] });
    filled.push(cell);
    next = cell.last + 1;
  }
  for (; next < slots.length; next++) filled.push({ first: next, last: next, meetings: [] });
  return filled;
}

/** Whether a class's times match the columns it spans exactly. */
export function matchesColumns(m: MeetingView, slots: SlotColumn[], cell: GridCell): boolean {
  return m.startMinutes === slots[cell.first].start && m.endMinutes === slots[cell.last].end;
}

export interface FitResult {
  slotIndex: number;
  batchId: number;
  teacherIds: number[];
  roomId: number;
}

/**
 * Where an unplaced group fits on a day: slots where its batches, a known
 * teacher and a suitable room are free and the engine reports no blocker.
 */
export function fitsForGroup(
  template: GroupTemplate,
  teacherIds: number[],
  day: number,
  slots: SlotColumn[],
  rooms: WorkbenchRoom[],
  teachers: WorkbenchTeacher[],
  context: EngineContext,
): FitResult[] {
  if (teacherIds.length === 0) return [];
  const size = knownAudienceSize(template);
  const candidates = suitableRooms(rooms, template.requiredRoomCapability, template.courseType);
  const fits: FitResult[] = [];
  slots.forEach((slot, slotIndex) => {
    if (teacherIds.some((id) => teacherAvailability(id, day, slot.start, slot.end, context, NEW_MEETING_ID).state !== "free")) return;
    const room = candidates.find((r) => roomAvailability(r, day, slot.start, slot.end, context, NEW_MEETING_ID, size).state === "free");
    if (!room) return;
    const candidate = candidateMeeting(template, {
      dayOfWeek: day, startMinutes: slot.start, endMinutes: slot.end, teacherIds, roomIds: [room.id], isException: false, exceptionNote: null,
    }, teachers, rooms);
    if (precheck(candidate, context).some((issue) => issue.severity === "blocker")) return;
    for (const audience of template.audiences) fits.push({ slotIndex, batchId: audience.batchId, teacherIds, roomId: room.id });
  });
  return fits;
}
