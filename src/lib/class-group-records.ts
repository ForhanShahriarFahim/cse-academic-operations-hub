/** CRS-01C class-group rules. No database or framework initialization. */
import { offeringInteger, offeringReason, offeringTermEditable } from "./offering-records";

export const groupInteger = offeringInteger;
export const groupReason = offeringReason;
export const groupTermEditable = offeringTermEditable;

/** Units are handled as whole hundredths so totals never drift. */
export const UNITS_MIN = 25, UNITS_MAX = 2000;
export function parseUnits(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]{1,2}(\.[0-9]{1,2})?$/.test(value.trim())) return null;
  const hundredths = Math.round(Number(value.trim()) * 100);
  return hundredths >= UNITS_MIN && hundredths <= UNITS_MAX ? hundredths : null;
}
export const formatUnits = (hundredths: number) => (hundredths / 100).toFixed(2);
/** Stored numeric(5,2) text to hundredths; anything unreadable is null. */
export function storedUnits(value: unknown): number | null {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

export const DELIVERY_MODES = ["fixed", "teacher_managed"] as const;
export type DeliveryMode = typeof DELIVERY_MODES[number];
export const parseDelivery = (value: unknown): DeliveryMode | null => value === "fixed" || value === "teacher_managed" ? value : null;

/** How several teachers of one class are credited. One teacher is always "sole"; none has no method. */
export type Crediting = "full" | "split";
export const METHOD_BY_CREDITING: Record<Crediting, string> = { full: "shared_policy", split: "split" };
export const METHOD_LABELS: Record<string, string> = { sole: "Sole teacher", shared_policy: "Each credited in full", split: "Units split between them", external: "External" };
export const methodLabel = (method: string) => METHOD_LABELS[method] ?? `${method} (unsupported)`;
export function allocationMethod(teacherCount: number, crediting: unknown): string | null {
  if (teacherCount <= 0) return null;
  if (teacherCount === 1) return "sole";
  return crediting === "full" || crediting === "split" ? METHOD_BY_CREDITING[crediting] : null;
}
export const creditingOf = (method: string | null): Crediting | "" => method === "shared_policy" ? "full" : method === "split" ? "split" : "";

export interface TeacherEntry { teacherId: number; units: number }
export type TeacherParse = { ok: true; rows: TeacherEntry[] } | { ok: false; message: string };
export const MAX_GROUP_TEACHERS = 12;
/** Parallel teacher / units lists from the form. Blank trailing rows are not sent by the form. */
export function parseTeachers(teacherIds: unknown[], units: unknown[]): TeacherParse {
  if (teacherIds.length !== units.length) return { ok: false, message: "Each teacher needs its own units." };
  if (teacherIds.length > MAX_GROUP_TEACHERS) return { ok: false, message: `A class group can have at most ${MAX_GROUP_TEACHERS} teachers.` };
  const rows: TeacherEntry[] = [];
  for (let index = 0; index < teacherIds.length; index++) {
    const teacherId = groupInteger(teacherIds[index]), value = parseUnits(units[index]);
    if (!teacherId) return { ok: false, message: `Choose a teacher in row ${index + 1}.` };
    if (value == null) return { ok: false, message: `Enter units between ${formatUnits(UNITS_MIN)} and ${formatUnits(UNITS_MAX)} in row ${index + 1}, with at most two decimals.` };
    if (rows.some(row => row.teacherId === teacherId)) return { ok: false, message: "The same teacher is listed twice." };
    rows.push({ teacherId, units: value });
  }
  return { ok: true, rows };
}

export interface Requirement { meetings: number; minutes: number | null; provisional: boolean }
export const MEETINGS_MIN = 1, MEETINGS_MAX = 14, MINUTES_MIN = 30, MINUTES_MAX = 1500;
const whole = (value: unknown) => typeof value === "string" && /^[0-9]{1,4}$/.test(value.trim()) ? Number(value.trim()) : null;
export type RequirementParse = { ok: true; requirement: Requirement } | { ok: false; errors: Record<string, string[]> };
/** Fixed delivery needs both numbers; teacher-managed delivery has neither (stored like the import: one, no minutes). */
export function parseRequirement(delivery: DeliveryMode, meetings: unknown, minutes: unknown, provisional: unknown): RequirementParse {
  if (delivery === "teacher_managed") return { ok: true, requirement: { meetings: 1, minutes: null, provisional: provisional === "on" } };
  const count = whole(meetings), total = whole(minutes), errors: Record<string, string[]> = {};
  if (count == null || count < MEETINGS_MIN || count > MEETINGS_MAX) errors.meetings = [`Enter classes per week from ${MEETINGS_MIN} to ${MEETINGS_MAX}.`];
  if (total == null || total < MINUTES_MIN || total > MINUTES_MAX) errors.minutes = [`Enter minutes per week from ${MINUTES_MIN} to ${MINUTES_MAX}.`];
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, requirement: { meetings: count!, minutes: total!, provisional: provisional === "on" } };
}

const plain = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);
/** Optional short text: blank is null; too long or control characters is undefined (refused). */
export function optionalText(value: unknown, max: number): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return !text ? null : text.length <= max && plain(text) ? text : undefined;
}
export const EXTERNAL_LABEL_MAX = 40, NOTES_MAX = 500, EXTERNAL_COUNT_MAX = 5000;
/** Blank means unknown (null); otherwise a whole number of students. */
export function externalCount(value: unknown): number | null | undefined {
  if (value == null || value === "") return null;
  const number = whole(value);
  return number != null && number <= EXTERNAL_COUNT_MAX ? number : undefined;
}

export interface UnitSuggestion { units: number; source: "previous" | "catalog" | "sessional" }
/**
 * A starting value the editor always sees and confirms: the last recorded units
 * for this course, else catalog credits for theory, else 2.00 for a one-credit
 * sessional (recorded current practice). Anything else has no suggestion.
 */
export function suggestUnits(course: { credits: string; courseType: string }, previous: number | null): UnitSuggestion | null {
  if (previous != null && previous >= UNITS_MIN && previous <= UNITS_MAX) return { units: previous, source: "previous" };
  const credits = storedUnits(course.credits);
  if (course.courseType === "theory" && credits != null && credits >= UNITS_MIN && credits <= UNITS_MAX) return { units: credits, source: "catalog" };
  if (course.courseType === "sessional" && credits === 100) return { units: 200, source: "sessional" };
  return null;
}

export interface GroupFacts {
  deliveryMode: string; teacherCount: number; hasMeetingTeacher: boolean;
  requirement: { minutes: number | null; provisional: boolean } | null;
  scheduledMeetings: number; scheduledMinutes: number; problems: number;
}
export type GroupState = "reconcile" | "teacher_managed" | "vacancy" | "no_requirement" | "provisional" | "ready";
export const GROUP_STATE_LABELS: Record<GroupState, string> = { reconcile: "Needs reconciliation", teacher_managed: "Teacher-managed", vacancy: "Vacancy", no_requirement: "No weekly requirement", provisional: "Provisional", ready: "Ready" };
/** Every state that applies, most important first. "Ready" only when nothing else is missing. */
export function groupStates(facts: GroupFacts): GroupState[] {
  const states: GroupState[] = [];
  if (facts.problems) states.push("reconcile");
  if (facts.deliveryMode === "teacher_managed") states.push("teacher_managed");
  if (!facts.teacherCount && !facts.hasMeetingTeacher) states.push("vacancy");
  if (facts.deliveryMode !== "teacher_managed" && facts.requirement?.minutes == null) states.push("no_requirement");
  if (facts.requirement?.provisional) states.push("provisional");
  if (!states.some(state => state === "reconcile" || state === "vacancy" || state === "no_requirement")) states.push("ready");
  return states;
}
export type ScheduleState = "teacher_managed" | "vacancy" | "unscheduled" | "over_scheduled" | "partial" | "scheduled";
export const SCHEDULE_LABELS: Record<ScheduleState, string> = { teacher_managed: "Teacher-managed", vacancy: "No teacher", unscheduled: "Not scheduled", over_scheduled: "Over-scheduled", partial: "Partially scheduled", scheduled: "Scheduled" };
/** Same order of tests as the existing completeness report, so both always agree. */
export function scheduleState(facts: GroupFacts): ScheduleState {
  if (facts.deliveryMode === "teacher_managed") return "teacher_managed";
  if (!facts.teacherCount && !facts.hasMeetingTeacher) return "vacancy";
  if (!facts.scheduledMeetings) return "unscheduled";
  const expected = facts.requirement?.minutes;
  if (expected && facts.scheduledMinutes > expected) return "over_scheduled";
  if (expected && facts.scheduledMinutes < expected) return "partial";
  return "scheduled";
}

export interface GroupUsage { meetings: number; enrollments: number; sessions: number; claims: number }
export const groupUsed = (usage: GroupUsage) => usage.meetings + usage.enrollments + usage.sessions + usage.claims > 0;
export function usageText(usage: GroupUsage): string {
  const part = (count: number, one: string, many: string) => count ? [`${count} ${count === 1 ? one : many}`] : [];
  return [...part(usage.meetings, "scheduled class", "scheduled classes"), ...part(usage.enrollments, "enrollment", "enrollments"), ...part(usage.sessions, "attendance session", "attendance sessions"), ...part(usage.claims, "extra-load record", "extra-load records")].join(", ");
}

export const CLASS_GROUP_COMMANDS = ["create", "update", "remove"] as const;
export const CLASS_GROUP_ACTION_LABELS: Record<string, string> = { "class_group.create": "Class group created", "class_group.update": "Class group changed", "class_group.remove": "Class group removed" };

export const GROUP_STATE_FILTERS = ["any", "ready", "vacancy", "no_requirement", "provisional", "merged", "teacher_managed", "reconcile", "unscheduled"] as const;
const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
/** Validated list filters; unknown values fall back to defaults and never reach a query. */
export function classGroupFilters(search: Record<string, string | string[] | undefined>) {
  const state = one(search.state), stream = one(search.stream);
  return {
    q: (one(search.q) ?? "").slice(0, 200),
    stream: stream === "HSC" || stream === "DIPLOMA" ? stream : "all",
    state: (GROUP_STATE_FILTERS as readonly string[]).includes(state ?? "") ? state! : "any",
    cohort: groupInteger(one(search.cohort)),
    teacher: groupInteger(one(search.teacher)),
  };
}
export function classGroupQuery(search: Record<string, string | string[] | undefined>, extra: Record<string, string> = {}) {
  const filters = classGroupFilters(search), query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.stream !== "all") query.set("stream", filters.stream);
  if (filters.state !== "any") query.set("state", filters.state);
  if (filters.cohort) query.set("cohort", String(filters.cohort));
  if (filters.teacher) query.set("teacher", String(filters.teacher));
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  const text = query.toString();
  return text ? `?${text}` : "";
}
