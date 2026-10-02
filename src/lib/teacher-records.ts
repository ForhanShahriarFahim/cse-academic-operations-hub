/**
 * TCH-01 (#4): teacher record rules. Pure: validation, change lists, status
 * transitions, placeholders, the effective workload limit and lifecycle blockers.
 */
import { WORKLOAD_ADVISORY_UNITS } from "./constants";

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "guest"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time", part_time: "Part-time", guest: "Guest / visiting",
};

export const TEACHER_STATUSES = ["active", "on_leave", "inactive", "vacancy", "unresolved"] as const;
export type TeacherStatus = (typeof TEACHER_STATUSES)[number];
export const STATUS_LABELS: Record<TeacherStatus, string> = {
  active: "Active", on_leave: "On leave", inactive: "Inactive", vacancy: "Vacancy", unresolved: "Unresolved",
};

export const DESIGNATION_SUGGESTIONS = [
  "Lecturer", "Senior Lecturer", "Assistant Professor", "Associate Professor", "Professor", "Adjunct Faculty",
];

/** UT and routine codes the source does not identify: never people, never accounts. */
export const isPlaceholder = (status: string) => status === "vacancy" || status === "unresolved";
/** Offered when choosing a teacher for new work. */
export const isAssignable = (status: string) => status === "active" || status === "on_leave";

export const employmentLabel = (type: string | null) =>
  type && type in EMPLOYMENT_LABELS ? EMPLOYMENT_LABELS[type as EmploymentType] : null;
export const statusLabel = (status: string) =>
  status in STATUS_LABELS ? STATUS_LABELS[status as TeacherStatus] : status;

/** The teacher's advisory limit in units; blank means the department default. */
export const effectiveLimit = (advisoryLoadUnits: number | string | null | undefined) =>
  advisoryLoadUnits == null || advisoryLoadUnits === "" ? WORKLOAD_ADVISORY_UNITS : Number(advisoryLoadUnits);

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const TEACHER_FIELDS = ["shortCode", "fullName", "designation", "employmentType", "homeDepartmentId", "email", "phonePrivate", "advisoryLoadUnits", "notes"] as const;
export type TeacherField = (typeof TEACHER_FIELDS)[number];

export const FIELD_LABELS: Record<TeacherField, string> = {
  shortCode: "Short code", fullName: "Full name", designation: "Designation", employmentType: "Employment type",
  homeDepartmentId: "Home department", email: "Email", phonePrivate: "Private phone", advisoryLoadUnits: "Workload limit", notes: "Notes",
};

/** Validated, normalised values as stored. `advisoryLoadUnits` is the numeric column's text, e.g. "12.5". */
export interface TeacherFields {
  shortCode: string;
  fullName: string;
  designation: string | null;
  employmentType: EmploymentType;
  homeDepartmentId: number;
  email: string | null;
  phonePrivate: string | null;
  advisoryLoadUnits: string | null;
  notes: string | null;
}

export type FieldErrors = Partial<Record<TeacherField, string[]>>;

const CODE = /^[A-Z0-9]{1,8}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 -]{0,28}$/;

const text = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value)).trim();
const optional = (value: unknown) => text(value) || null;

/**
 * Validate a submitted form. `phone` is left out (and must stay unchanged) when
 * the editor may not see private contacts.
 */
export function normalizeTeacher(
  raw: Record<string, unknown>,
  options: { departmentIds: ReadonlySet<number>; includePhone: boolean },
): { ok: true; fields: Omit<TeacherFields, "phonePrivate"> & { phonePrivate?: string | null } } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const fail = (field: TeacherField, message: string) => { (errors[field] ??= []).push(message); };

  const shortCode = text(raw.shortCode).toUpperCase();
  if (!shortCode) fail("shortCode", "Enter a short code.");
  else if (!CODE.test(shortCode)) fail("shortCode", "Use 1 to 8 letters or digits, with no spaces.");

  const fullName = text(raw.fullName).replace(/\s+/g, " ");
  if (fullName.length < 2) fail("fullName", "Enter the teacher's full name.");
  else if (fullName.length > 120) fail("fullName", "Keep the name to 120 characters.");

  const designation = optional(raw.designation)?.replace(/\s+/g, " ") ?? null;
  if (designation && designation.length > 80) fail("designation", "Keep the designation to 80 characters.");

  const employmentType = text(raw.employmentType);
  if (!(EMPLOYMENT_TYPES as readonly string[]).includes(employmentType)) fail("employmentType", "Choose an employment type.");

  const departmentId = Number(text(raw.homeDepartmentId));
  if (!Number.isInteger(departmentId) || !options.departmentIds.has(departmentId)) fail("homeDepartmentId", "Choose a home department.");

  const email = optional(raw.email)?.toLowerCase() ?? null;
  if (email && (email.length > 254 || !EMAIL.test(email))) fail("email", "Enter an address like name@example.edu.");

  let phonePrivate: string | null | undefined;
  if (options.includePhone) {
    phonePrivate = optional(raw.phonePrivate)?.replace(/\s+/g, " ") ?? null;
    if (phonePrivate && !PHONE.test(phonePrivate)) fail("phonePrivate", "Use digits, spaces, + and - only, up to 30 characters.");
  }

  const limitText = text(raw.advisoryLoadUnits);
  let advisoryLoadUnits: string | null = null;
  if (limitText) {
    const limit = Number(limitText);
    if (!Number.isFinite(limit) || limit < 1 || limit > 40 || !Number.isInteger(limit * 2)) {
      fail("advisoryLoadUnits", "Enter 1 to 40 units in steps of 0.5, or leave it blank for the default.");
    } else advisoryLoadUnits = limit.toFixed(1);
  }

  const notes = optional(raw.notes);
  if (notes && notes.length > 1000) fail("notes", "Keep notes to 1,000 characters.");

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      shortCode, fullName, designation, employmentType: employmentType as EmploymentType, homeDepartmentId: departmentId,
      email, ...(options.includePhone ? { phonePrivate } : {}), advisoryLoadUnits, notes,
    },
  };
}

/** Another record already using the code, compared in upper case. */
export function shortCodeClash<T extends { id: number; shortCode: string }>(code: string, others: readonly T[], selfId: number | null): T | null {
  return others.find((other) => other.id !== selfId && other.shortCode.toUpperCase() === code.toUpperCase()) ?? null;
}

type Comparable = Partial<Record<TeacherField, string | number | null | undefined>>;
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || (a != null && b != null && String(a) === String(b));

/**
 * The fields that differ, for saving and auditing. The private phone is never
 * copied into `before`/`after`; `phoneChanged` records only that it changed.
 */
export function teacherChanges(before: Comparable, after: Comparable): {
  fields: TeacherField[]; before: Record<string, unknown>; after: Record<string, unknown>; phoneChanged: boolean;
} {
  const fields = TEACHER_FIELDS.filter((field) => field in after && after[field] !== undefined && !same(before[field], after[field]));
  const pick = (source: Comparable) => Object.fromEntries(fields.filter((field) => field !== "phonePrivate").map((field) => [field, source[field] ?? null]));
  return { fields, before: pick(before), after: pick(after), phoneChanged: fields.includes("phonePrivate") };
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export type LifecycleAction = "edit" | "set_on_leave" | "back_from_leave" | "deactivate" | "reactivate" | "resolve" | "delete";

const FROM: Record<Exclude<LifecycleAction, "delete">, readonly TeacherStatus[]> = {
  edit: ["active", "on_leave", "inactive"],
  set_on_leave: ["active"],
  back_from_leave: ["on_leave"],
  deactivate: ["active", "on_leave"],
  reactivate: ["inactive"],
  resolve: ["unresolved"],
};

export const NEXT_STATUS: Partial<Record<LifecycleAction, TeacherStatus>> = {
  set_on_leave: "on_leave", back_from_leave: "active", deactivate: "inactive", reactivate: "active", resolve: "active",
};

/** Whether the action is offered from this status. Delete also needs an unreferenced record. */
export function allowedFrom(action: LifecycleAction, status: string): boolean {
  if (action === "delete") return true;
  return (FROM[action] as readonly string[]).includes(status);
}

/** A plain reason the action is not available from this status. */
export function transitionRefusal(action: LifecycleAction, status: string): string {
  if (status === "vacancy") return "UT is a vacancy marker, not a person. Reassign its classes in Courses instead.";
  if (status === "unresolved" && action !== "resolve") return "This routine code is unresolved. Resolve it first: record who it is.";
  return `Not available while the teacher is ${statusLabel(status).toLowerCase()}.`;
}

// ---------------------------------------------------------------------------
// Lifecycle checks
// ---------------------------------------------------------------------------

/** Everything that refers to a teacher. Active-term lists carry detail; other counts are totals across terms. */
export interface TeacherReferences {
  termName: string;
  activeTerm: {
    classes: Array<{ courseCode: string; day: string; time: string }>;
    allocations: Array<{ courseCode: string | null; method: string; externalDepartment: string | null }>;
    extraLoad: Array<{ classDate: string; courseCode: string }>;
    externals: Array<{ counterpartDepartment: string; courseLabel: string | null }>;
  };
  anyTerm: { classes: number; allocations: number; extraLoad: number; externals: number; attendanceSessions: number; terms: number };
  portalAccount: { email: string } | null;
  publishedVersions: Array<{ termName: string; versionNumber: number }>;
}

export interface LifecycleItem {
  kind: "classes" | "allocations" | "extra_load" | "externals";
  label: string;
  detail: string;
  href: string;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const sample = (items: string[]) => items.slice(0, 4).join(" · ") + (items.length > 4 ? ` · and ${items.length - 4} more` : "");

/** Active-term work that must be reassigned before deactivation. Past terms never block. */
export function deactivationBlockers(refs: TeacherReferences): LifecycleItem[] {
  const { classes, allocations, externals } = refs.activeTerm;
  const items: LifecycleItem[] = [];
  if (classes.length) items.push({ kind: "classes", label: `${plural(classes.length, "class", "classes")} in the working routine`, detail: sample(classes.map((c) => `${c.courseCode} ${c.day} ${c.time}`)), href: "/routine" });
  if (allocations.length) items.push({ kind: "allocations", label: plural(allocations.length, "workload allocation"), detail: sample(allocations.map((a) => `${a.courseCode ?? a.externalDepartment ?? "External"} (${a.method.replace("_", " ")})`)), href: "/workload" });
  if (externals.length) items.push({ kind: "externals", label: plural(externals.length, "other-department commitment"), detail: sample(externals.map((e) => [e.counterpartDepartment, e.courseLabel].filter(Boolean).join(" "))), href: "/od" });
  return items;
}

/**
 * Active-term records that stay with an inactive teacher and do not block:
 * extra-load classes have no "settled" state, and stay on their sheets.
 */
export function deactivationNotes(refs: TeacherReferences): LifecycleItem[] {
  const { extraLoad } = refs.activeTerm;
  return extraLoad.length
    ? [{ kind: "extra_load", label: `${plural(extraLoad.length, "extra-load class", "extra-load classes")} this term stay on their sheets`, detail: sample(extraLoad.map((e) => `${e.classDate} ${e.courseCode}`)), href: "/extra-load" }]
    : [];
}

/** Why a record cannot be deleted; empty when it was never used anywhere. */
export function deletionRefusals(refs: TeacherReferences): string[] {
  const { anyTerm } = refs;
  const reasons: string[] = [];
  if (refs.publishedVersions.length) reasons.push(`The code appears in ${refs.publishedVersions.map((v) => `${v.termName} publication v${v.versionNumber}`).join(", ")}.`);
  const used = [
    anyTerm.classes && plural(anyTerm.classes, "routine class", "routine classes"),
    anyTerm.allocations && plural(anyTerm.allocations, "workload allocation"),
    anyTerm.extraLoad && plural(anyTerm.extraLoad, "extra-load class", "extra-load classes"),
    anyTerm.externals && plural(anyTerm.externals, "other-department commitment"),
    anyTerm.attendanceSessions && plural(anyTerm.attendanceSessions, "attendance session"),
  ].filter(Boolean);
  if (used.length) reasons.push(`It is used by ${used.join(", ")}${anyTerm.terms > 1 ? ` across ${anyTerm.terms} terms` : ""}.`);
  if (refs.portalAccount) reasons.push(`A portal account (${refs.portalAccount.email}) is linked to it.`);
  return reasons;
}

/** Does a published snapshot list this short code? Snapshots store teachers as `{ shortCode, … }`. */
export function snapshotMentionsCode(snapshot: unknown, code: string): boolean {
  const wanted = code.toUpperCase();
  const seen = new Set<unknown>();
  const visit = (value: unknown): boolean => {
    if (value == null || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some(visit);
    const record = value as Record<string, unknown>;
    if (typeof record.shortCode === "string" && record.shortCode.toUpperCase() === wanted) return true;
    return Object.values(record).some(visit);
  };
  return visit(snapshot);
}
