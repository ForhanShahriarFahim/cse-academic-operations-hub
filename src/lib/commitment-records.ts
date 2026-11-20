/**
 * OD-01A — database-free rules for cross-department commitments (spec D-1–D-4).
 * Pure: safe in the browser (impact preview) and in the domain test harness.
 */
import { DAY_NAMES, fmtRange, overlaps, parseTimeToMinutes } from "./time";
import { civilDay, dateBounds, firstWeekday, type DateBounds } from "./room-maintenance";

export interface CommitmentDates { effectiveFrom: string | null; effectiveTo: string | null }
type TermBounds = Pick<DateBounds, "termStart" | "termEnd">;

export type CommitmentKind = "teaching" | "room_reservation" | "combined" | "unresolved_note";
export type CompletenessLevel = "A" | "B" | "C" | "D";

export const COMMITMENT_CHOICES: ReadonlyArray<{ kind: CommitmentKind; label: string; short: string; help: string }> = [
  { kind: "teaching", label: "Our teacher teaches for another department", short: "Our teacher teaches elsewhere", help: "Blocks that teacher at that time. The other department's room is not ours to block." },
  { kind: "room_reservation", label: "Another department uses one of our rooms", short: "Another department uses our room", help: "Blocks only that room. No teacher clash is invented." },
  { kind: "combined", label: "Our teacher teaches another department in our room", short: "Teacher and room", help: "Blocks the teacher and the room." },
  { kind: "unresolved_note", label: "Only a note — the details are not known yet", short: "Note only", help: "Blocks nothing. Resolve it when the facts arrive." },
];
export const isCommitmentKind = (value: unknown): value is CommitmentKind => COMMITMENT_CHOICES.some((choice) => choice.kind === value);
export const choiceOf = (kind: string) => COMMITMENT_CHOICES.find((choice) => choice.kind === kind);

export const usesTeacher = (kind: string) => kind === "teaching" || kind === "combined";
export const usesRoom = (kind: string) => kind === "room_reservation" || kind === "combined";

export const REASON_LIMIT = 300;
const DEPARTMENT_LIMIT = 80;
const LABEL_LIMIT = 120;
const NOTES_LIMIT = 1000;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const LINE_CONTROL = /[\u0000-\u001f\u007f]/;

/** Facts a commitment states. Unknown facts are null, never zero or invented. */
export interface CommitmentFacts extends CommitmentDates {
  kind: CommitmentKind;
  counterpartDepartment: string;
  teacherId: number | null;
  roomId: number | null;
  dayOfWeek: number | null;
  startMinutes: number | null;
  endMinutes: number | null;
  courseLabel: string | null;
  audienceLabel: string | null;
  credits: string | null;
  notes: string | null;
}

export type ParseResult =
  | { ok: true; value: CommitmentFacts }
  | { ok: false; message: string; errors: Record<string, string[]> };

/** One trimmed 1–300 character reason or note without control characters, else null. */
export function parseReason(value: unknown, limit = REASON_LIMIT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= limit && !CONTROL.test(value) ? trimmed : null;
}

const text = (raw: unknown) => (typeof raw === "string" ? raw.trim() : "");
function optionalId(raw: unknown): number | null | undefined {
  const value = text(raw);
  if (!value) return null;
  return /^\d{1,9}$/.test(value) && Number(value) > 0 ? Number(value) : undefined;
}

/**
 * Validate one form submission for its D-2 choice. Only the facts that apply to
 * the choice are kept; the rest are stored as null so nothing is fabricated.
 */
export function parseCommitmentDates(raw: { effectiveFrom?: unknown; effectiveTo?: unknown }, day: number | null, bounds?: TermBounds) {
  const effectiveFrom = text(raw.effectiveFrom) || null;
  const effectiveTo = text(raw.effectiveTo) || null;
  const dates = { effectiveFrom, effectiveTo };
  const errors: Record<string, string[]> = {};
  if (effectiveFrom === null && effectiveTo === null) return { dates, errors };
  const start = civilDay(effectiveFrom), end = civilDay(effectiveTo);
  const term = bounds && dateBounds(bounds);
  if (start === null) errors.effectiveFrom = ["Enter a valid start date."];
  else if (bounds && (!term || start < term.start || start > term.end)) errors.effectiveFrom = ["Choose a start date within the term."];
  if (end === null) errors.effectiveTo = ["Enter a valid end date."];
  else if (bounds && (!term || end < term.start || end > term.end)) errors.effectiveTo = ["Choose an end date within the term."];
  else if (start !== null && end < start) errors.effectiveTo = ["Choose an end date on or after the start date."];
  else if (start !== null && day !== null && firstWeekday(start, end, [day]) === null) errors.effectiveTo = ["Include at least one occurrence of the selected weekday."];
  return { dates, errors };
}

export function parseCommitmentInput(raw: Record<string, unknown>, bounds?: TermBounds): ParseResult {
  const errors: Record<string, string[]> = {};
  const add = (field: string, message: string) => { (errors[field] ??= []).push(message); };
  const kind = raw.kind;
  if (!isCommitmentKind(kind)) {
    add("kind", "Choose what is committed.");
    return { ok: false, message: "Choose what is committed.", errors };
  }
  const department = text(raw.counterpartDepartment);
  if (!department) add("counterpartDepartment", "Enter the other department.");
  else if (department.length > DEPARTMENT_LIMIT || LINE_CONTROL.test(department)) add("counterpartDepartment", `Use at most ${DEPARTMENT_LIMIT} characters on one line.`);
  const label = (field: "courseLabel" | "audienceLabel") => {
    const value = text(raw[field]);
    if (value.length > LABEL_LIMIT || LINE_CONTROL.test(value)) { add(field, `Use at most ${LABEL_LIMIT} characters on one line.`); return null; }
    return value || null;
  };
  const courseLabel = label("courseLabel");
  const audienceLabel = label("audienceLabel");
  const notesRaw = typeof raw.notes === "string" ? raw.notes.trim() : "";
  if (notesRaw.length > NOTES_LIMIT || CONTROL.test(notesRaw)) add("notes", `Use at most ${NOTES_LIMIT} characters without control characters.`);
  const notes = notesRaw || null;

  let teacherId: number | null = null, roomId: number | null = null;
  let dayOfWeek: number | null = null, startMinutes: number | null = null, endMinutes: number | null = null;
  let credits: string | null = null;

  if (kind === "unresolved_note") {
    if (!notes) add("notes", "Write the note: what is known and what is still unconfirmed.");
  } else {
    if (usesTeacher(kind)) {
      const id = optionalId(raw.teacherId);
      if (id == null) add("teacherId", id === undefined ? "Choose a teacher from the list." : "Choose the teacher.");
      else teacherId = id;
    }
    if (usesRoom(kind)) {
      const id = optionalId(raw.roomId);
      if (id == null) add("roomId", id === undefined ? "Choose a room from the list." : "Choose the room.");
      else roomId = id;
    }
    const day = text(raw.dayOfWeek);
    if (!/^[0-6]$/.test(day)) add("dayOfWeek", "Choose the day.");
    else dayOfWeek = Number(day);
    const start = text(raw.startTime), end = text(raw.endTime);
    startMinutes = start ? parseTimeToMinutes(start) : null;
    endMinutes = end ? parseTimeToMinutes(end) : null;
    if (!start) add("startTime", "Enter the start time.");
    else if (startMinutes == null || startMinutes >= 24 * 60) add("startTime", "Enter a time such as 9:00 AM.");
    if (!end) add("endTime", "Enter the end time.");
    else if (endMinutes == null || endMinutes > 24 * 60) add("endTime", "Enter a time such as 10:15 AM.");
    else if (startMinutes != null && endMinutes <= startMinutes) add("endTime", "End must be after the start.");
    if (usesTeacher(kind)) {
      const value = text(raw.credits);
      if (value && !/^\d{1,2}(?:\.\d)?$/.test(value)) add("credits", "Enter credits from 0 to 99.9 with at most one decimal place, or leave blank.");
      else credits = value || null;
    }
  }
  const { dates, errors: dateErrors } = parseCommitmentDates(kind === "unresolved_note" ? {} : raw, dayOfWeek, bounds);
  Object.assign(errors, dateErrors);
  const fields = Object.keys(errors);
  if (fields.length) return { ok: false, message: fields.length === 1 ? errors[fields[0]][0] : "Check the highlighted fields.", errors };
  return {
    ok: true,
    value: {
      kind, counterpartDepartment: department, teacherId, roomId, dayOfWeek, startMinutes, endMinutes,
      courseLabel, audienceLabel, credits: kind === "room_reservation" ? null : credits, notes, ...dates,
    },
  };
}

type LevelFacts = Pick<CommitmentFacts, "kind" | "teacherId" | "roomId" | "courseLabel" | "credits">;

/** D-3: how much of the class picture is known. Independent of verification. */
export function completenessLevel(facts: LevelFacts): CompletenessLevel {
  if (facts.kind === "unresolved_note") return "D";
  if (facts.kind === "room_reservation" || facts.teacherId == null) return "C";
  const full = facts.courseLabel != null && facts.credits != null && (facts.kind !== "combined" || facts.roomId != null);
  return full ? "A" : "B";
}

/** Facts that would raise the level, in the order the form shows them. */
export function completenessLadder(facts: LevelFacts): Array<{ label: string; known: boolean }> {
  if (facts.kind === "unresolved_note") return [{ label: "Resolve the note into a structured commitment", known: false }];
  if (facts.kind === "room_reservation") return [{ label: "Room", known: facts.roomId != null }, { label: "Day and time", known: true }];
  return [
    { label: "Teacher", known: facts.teacherId != null },
    { label: "Day and time", known: true },
    ...(facts.kind === "combined" ? [{ label: "Room", known: facts.roomId != null }] : []),
    { label: "Course", known: facts.courseLabel != null },
    { label: "Credits", known: facts.credits != null },
  ];
}

export function levelSummary(level: string, facts: LevelFacts): string {
  if (level === "D") return "note only";
  if (level === "C") return "room and time";
  if (level === "A") return "complete";
  const missing = completenessLadder(facts).filter((item) => !item.known).map((item) => item.label.toLowerCase());
  return missing.length ? `${missing.join(", ")} missing` : "partly known";
}

/** Choice, teacher, room, day and time: changing any of these returns a verified record to Pending. */
export const PLANNING_FIELDS = ["kind", "teacherId", "roomId", "dayOfWeek", "startMinutes", "endMinutes", "effectiveFrom", "effectiveTo"] as const;
type PlanningFacts = { kind: string } & Pick<CommitmentFacts, "teacherId" | "roomId" | "dayOfWeek" | "startMinutes" | "endMinutes"> & Partial<CommitmentDates>;
export function planningFactsChanged(before: PlanningFacts, after: PlanningFacts): boolean {
  return PLANNING_FIELDS.some((field) => (before[field] ?? null) !== (after[field] ?? null));
}

export const EDITABLE_FIELDS = ["kind", "counterpartDepartment", "teacherId", "roomId", "dayOfWeek", "startMinutes", "endMinutes", "effectiveFrom", "effectiveTo", "courseLabel", "audienceLabel", "credits", "notes"] as const;
const normal = (value: unknown) => (value == null ? null : typeof value === "number" ? value : String(value));
/** Field names whose stored values differ, for the audit detail and history (credits compared numerically). */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return EDITABLE_FIELDS.filter((field) => {
    const a = normal(before[field]), b = normal(after[field]);
    if (field === "credits" && a != null && b != null) return Number(a) !== Number(b);
    return a !== b;
  });
}

/** Stored rows the new form would refuse (D-3). Shown as "Needs review" until edited. */
export function reviewReasons(row: { kind: string; teacherId: number | null; roomId: number | null; dayOfWeek: number | null; startMinutes: number | null; endMinutes: number | null }): string[] {
  const reasons: string[] = [];
  if (!isCommitmentKind(row.kind)) return [`Unknown kind “${row.kind}”. Edit it and choose what is committed.`];
  if (row.kind === "unresolved_note") return reasons;
  if (usesTeacher(row.kind) && row.teacherId == null) reasons.push("Recorded as teaching with no teacher, so it blocks no teacher.");
  if (usesRoom(row.kind) && row.roomId == null) reasons.push("Recorded as room use with no room, so it blocks no room.");
  if (row.kind === "room_reservation" && row.teacherId != null) reasons.push("A room-only record carries a teacher who is never checked for clashes.");
  if (row.dayOfWeek == null || row.startMinutes == null || row.endMinutes == null || row.endMinutes <= row.startMinutes) reasons.push("The day or time is missing or invalid, so it blocks nothing.");
  return reasons;
}

interface BlockSubject { kind: string; teacherId: number | null; roomId: number | null; dayOfWeek: number | null; startMinutes: number | null; endMinutes: number | null }
export const blocksTeacher = (e: BlockSubject) => usesTeacher(e.kind) && e.teacherId != null;
export const blocksRoom = (e: BlockSubject) => usesRoom(e.kind) && e.roomId != null;
const timed = <T extends BlockSubject>(e: T): e is T & { dayOfWeek: number; startMinutes: number; endMinutes: number } =>
  e.dayOfWeek != null && e.startMinutes != null && e.endMinutes != null;

/** D-1 "Blocks" column: the planning effect in words. */
export function blocksText(e: BlockSubject, names: { teacher?: string | null; room?: string | null }): string {
  if (e.kind === "unresolved_note") return "Nothing — unresolved note";
  if (!timed(e)) return "Nothing — no day and time";
  const parts = [blocksTeacher(e) ? names.teacher ?? "The teacher" : null, blocksRoom(e) ? `room ${names.room ?? "?"}` : null].filter(Boolean) as string[];
  if (!parts.length) return "Nothing — facts missing";
  return parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)} only`;
}

export interface ClashMeeting extends Partial<CommitmentDates> {
  id: number; dayOfWeek: number; startMinutes: number; endMinutes: number; courseCode: string;
  teachers: Array<{ id: number; shortCode: string; fullName?: string }>; rooms: Array<{ id: number; code: string }>; audience?: string;
}
export interface CommitmentClash { meetingId: number; on: "teacher" | "room"; code: string; meeting: ClashMeeting }

/**
 * The one overlap rule shared by the conflict engine and the impact preview (AC-03):
 * a teacher blocker for teaching/combined records with a teacher, a room blocker
 * for room/combined records with a room, on the same day with overlapping minutes.
 */
export function commitmentOccursWith(commitment: Partial<CommitmentDates>, meeting: Partial<CommitmentDates>, weekday: number, bounds?: TermBounds) {
  if (!bounds || (commitment.effectiveFrom == null && commitment.effectiveTo == null)) return true;
  const external = dateBounds({ ...bounds, ...commitment }), formal = dateBounds({ ...bounds, ...meeting });
  return !external || !formal || firstWeekday(Math.max(external.start, formal.start), Math.min(external.end, formal.end), [weekday]) !== null;
}

export function commitmentClashes(e: BlockSubject & Partial<CommitmentDates>, meetings: readonly ClashMeeting[], bounds?: TermBounds): CommitmentClash[] {
  if (!timed(e)) return [];
  const clashes: CommitmentClash[] = [];
  for (const m of meetings) {
    if (m.dayOfWeek !== e.dayOfWeek || !overlaps(m.startMinutes, m.endMinutes, e.startMinutes, e.endMinutes)) continue;
    if (!commitmentOccursWith(e, m, m.dayOfWeek, bounds)) continue;
    if (blocksTeacher(e)) { const t = m.teachers.find((x) => x.id === e.teacherId); if (t) clashes.push({ meetingId: m.id, on: "teacher", code: t.shortCode, meeting: m }); }
    if (blocksRoom(e)) { const r = m.rooms.find((x) => x.id === e.roomId); if (r) clashes.push({ meetingId: m.id, on: "room", code: r.code, meeting: m }); }
  }
  return clashes;
}

export const commitmentDateLabel = (dates: Partial<CommitmentDates>) => dates.effectiveFrom && dates.effectiveTo
  ? (dates.effectiveFrom === dates.effectiveTo ? dates.effectiveFrom : `${dates.effectiveFrom}–${dates.effectiveTo}`) : null;

export const scheduleText = (e: Pick<BlockSubject, "dayOfWeek" | "startMinutes" | "endMinutes"> & Partial<CommitmentDates>) =>
  e.dayOfWeek != null && e.startMinutes != null && e.endMinutes != null ?
    [`${DAY_NAMES[e.dayOfWeek]?.slice(0, 3) ?? "?"} ${fmtRange(e.startMinutes, e.endMinutes)}`, commitmentDateLabel(e)].filter(Boolean).join(" · ") : null;

export interface LinkMeeting extends Partial<CommitmentDates> {
  teachingGroupId: number; deliveryMode: string; pendingReconciliation: boolean; dayOfWeek: number;
  startMinutes: number; endMinutes: number; teachers: readonly { id: number }[]; rooms: readonly { id: number }[];
}

export function meetingCoversCommitment(commitment: BlockSubject & Partial<CommitmentDates>, meeting: LinkMeeting, bounds: TermBounds) {
  if (!timed(commitment) || !blocksTeacher(commitment) || (usesRoom(commitment.kind) && !blocksRoom(commitment)) || meeting.deliveryMode !== "fixed" || meeting.pendingReconciliation) return false;
  if (meeting.dayOfWeek !== commitment.dayOfWeek || meeting.startMinutes !== commitment.startMinutes || meeting.endMinutes !== commitment.endMinutes) return false;
  if (!meeting.teachers.some((teacher) => teacher.id === commitment.teacherId) || (blocksRoom(commitment) && !meeting.rooms.some((room) => room.id === commitment.roomId))) return false;
  const booking = dateBounds({ ...bounds, ...commitment }), formal = dateBounds({ ...bounds, ...meeting });
  if (!booking || !formal) return false;
  const first = firstWeekday(booking.start, booking.end, [commitment.dayOfWeek]);
  return first !== null && formal.start <= first && formal.end >= first + 7 * Math.floor((booking.end - first) / 7);
}

// ---------------------------------------------------------------------------
// D-4 lifecycle availability
// ---------------------------------------------------------------------------

export type LifecycleCommand = "edit" | "verify" | "return" | "resolve" | "archive" | "reactivate" | "delete";
export interface LifecycleState { kind: string; lifecycleStatus: string; verificationStatus: string }
export function availableCommands(e: LifecycleState): LifecycleCommand[] {
  if (e.lifecycleStatus === "archived") return ["reactivate", "delete"];
  const commands: LifecycleCommand[] = [];
  if (e.kind === "unresolved_note") commands.push("resolve");
  else commands.push("edit");
  if (e.kind !== "unresolved_note" && e.verificationStatus !== "verified") commands.push("verify");
  if (e.verificationStatus === "verified") commands.push("return");
  commands.push("archive", "delete");
  return commands;
}

// ---------------------------------------------------------------------------
// D-1 register projection
// ---------------------------------------------------------------------------

export interface RegisterRow {
  id: number; kind: string; lifecycleStatus: string; verificationStatus: string;
  counterpartDepartment: string; courseLabel: string | null; audienceLabel: string | null; notes: string | null;
}
export interface RegisterFilters { state: "active" | "archived" | "all"; verification: "any" | "pending" | "verified"; kind: CommitmentKind | "any"; q: string }

export function parseRegisterFilters(raw: Record<string, string | string[] | undefined>): RegisterFilters {
  const one = (key: string) => { const value = raw[key]; return typeof value === "string" ? value : ""; };
  const state = one("state"), verification = one("verification"), kind = one("kind");
  const q = one("q").trim().slice(0, 80);
  return {
    state: state === "archived" || state === "all" ? state : "active",
    verification: verification === "pending" || verification === "verified" ? verification : "any",
    kind: isCommitmentKind(kind) ? kind : "any",
    q: LINE_CONTROL.test(q) ? "" : q,
  };
}

export function registerCounts(rows: readonly RegisterRow[]) {
  const active = rows.filter((r) => r.lifecycleStatus !== "archived");
  return {
    active: active.length,
    pending: active.filter((r) => r.verificationStatus !== "verified").length,
    verified: active.filter((r) => r.verificationStatus === "verified").length,
    unresolved: active.filter((r) => r.kind === "unresolved_note").length,
    archived: rows.length - active.length,
  };
}

export function filterRegister<T extends RegisterRow>(rows: readonly T[], filters: RegisterFilters): T[] {
  const q = filters.q.toLowerCase();
  return rows.filter((r) =>
    (filters.state === "all" || (filters.state === "archived") === (r.lifecycleStatus === "archived"))
    && (filters.verification === "any" || (filters.verification === "verified") === (r.verificationStatus === "verified"))
    && (filters.kind === "any" || r.kind === filters.kind)
    && (!q || [r.counterpartDepartment, r.courseLabel, r.audienceLabel, r.notes].some((v) => v?.toLowerCase().includes(q))));
}

export function registerQuery(filters: RegisterFilters): string {
  const params = new URLSearchParams();
  if (filters.state !== "active") params.set("state", filters.state);
  if (filters.verification !== "any") params.set("verification", filters.verification);
  if (filters.kind !== "any") params.set("kind", filters.kind);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** A return link back to the register only; anything else falls back to the plain register. */
export function safeRegisterReturn(value: unknown): string {
  return typeof value === "string" && /^\/od(\?[A-Za-z0-9_\-.~%=&+]*)?$/.test(value) ? value : "/od";
}

// ---------------------------------------------------------------------------
// D-6 history
// ---------------------------------------------------------------------------

export const HISTORY_ACTIONS: Record<string, string> = {
  "external.create": "Created",
  "external.edit": "Edited",
  "external.verify": "Verified",
  "external.return": "Returned to pending",
  "external.resolve": "Resolved from note",
  "external.archive": "Archived",
  "external.reactivate": "Reactivated",
  "external.delete": "Deleted",
  "external.carry": "Carried from a previous term",
  "external.link": "Linked to a teaching group",
  "external.unlink": "Teaching group link removed",
};
export const FIELD_LABELS: Record<string, string> = {
  kind: "What is committed", counterpartDepartment: "Department", teacherId: "Teacher", roomId: "Room", dayOfWeek: "Day",
  startMinutes: "Start", endMinutes: "End", courseLabel: "Course", audienceLabel: "Audience", credits: "Credits", notes: "Notes",
  effectiveFrom: "Effective from", effectiveTo: "Effective through",
  verificationStatus: "Verification", completenessLevel: "Completeness",
  linkedTeachingGroupId: "Teaching group",
};
