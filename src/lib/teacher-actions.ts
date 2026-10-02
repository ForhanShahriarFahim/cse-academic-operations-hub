"use server";

/**
 * TCH-01 (#4) teacher record actions. Each one checks `manage_teachers` on the
 * server, refuses stale edits, re-checks references inside its transaction and
 * writes one audit event (entity `teacher`) with the change. The private phone
 * is read and written only for holders of `view_private_contacts`, and never
 * reaches the audit log.
 */
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { departments, teachers } from "@/db/schema";
import { can, type Actor } from "./auth";
import { actionActor } from "./auth/action-guard";
import { auditedChange } from "./auth/audit";
import { conflicted, invalid, stale, succeeded, type ActionResult } from "./action-result";
import {
  NEXT_STATUS, allowedFrom, deactivationBlockers, deletionRefusals, isPlaceholder, normalizeTeacher, shortCodeClash,
  teacherChanges, transitionRefusal, type LifecycleAction,
} from "./teacher-records";
import { getShortCodes, getTeacherRecord, getTeacherReferences } from "./teacher-data";

const CHANGED = "Someone else changed this teacher while you were editing. Reload the page to see their change, then try again.";
const MISSING = "This teacher no longer exists. Go back to the Teachers list.";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

function refresh(teacherId?: number) {
  revalidatePath("/teachers");
  if (teacherId) revalidatePath(`/teachers/${teacherId}`);
  revalidatePath("/workload");
  revalidatePath("/routine");
  revalidatePath("/", "layout");
}

async function editor(): Promise<{ actor: Actor; privateContacts: boolean } | ActionResult> {
  const actor = await actionActor("manage_teachers");
  if ("ok" in actor) return actor;
  return { actor, privateContacts: await can(actor, "view_private_contacts") };
}

const isResult = (value: unknown): value is ActionResult => typeof value === "object" && value != null && "ok" in value;
const matches = (updatedAt: Date, expected: string) => updatedAt.toISOString() === expected;

/** Add a teacher, edit one, or resolve an unresolved routine code (`resolve=1`). */
export async function saveTeacherAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const who = await editor();
  if (isResult(who)) return who;
  const teacherId = field(formData, "teacherId") ? Number(field(formData, "teacherId")) : null;
  const resolving = field(formData, "resolve") === "1";

  const existing = teacherId == null ? null : await getTeacherRecord(teacherId);
  if (teacherId != null && !existing) return stale(MISSING, "missing");
  if (existing) {
    const action: LifecycleAction = resolving ? "resolve" : "edit";
    if (!allowedFrom(action, existing.status)) return refused(transitionRefusal(action, existing.status));
    if (!matches(existing.updatedAt, field(formData, "expectedUpdatedAt"))) return stale(CHANGED);
  }

  const raw = Object.fromEntries([...formData.entries()].map(([key, value]) => [key, typeof value === "string" ? value : ""]));
  // A resolved placeholder keeps the code the routine already uses.
  if (resolving && existing) raw.shortCode = existing.shortCode;
  const departmentIds = new Set((await db.select({ id: departments.id }).from(departments)).map((row) => row.id));
  const parsed = normalizeTeacher(raw, { departmentIds, includePhone: who.privateContacts });
  // Report a taken code with the other field errors; the transaction checks again before writing.
  const code = String(raw.shortCode ?? "").trim().toUpperCase();
  const taken = code ? shortCodeClash(code, await getShortCodes(), existing?.id ?? null) : null;
  if (!parsed.ok || taken) {
    const errors = { ...(parsed.ok ? {} : parsed.errors) } as Record<string, string[]>;
    if (taken && !errors.shortCode) errors.shortCode = [`${taken.shortCode} is already used by ${taken.fullName}.`];
    return invalid("Check the highlighted fields.", errors);
  }
  const values = parsed.fields;
  if (existing && !resolving && !teacherChanges(existing, values).fields.length) return succeeded("Nothing changed.", { entityId: existing.id });

  try {
    const result = await auditedChange(existing ? (resolving ? "teacher.resolve" : "teacher.update") : "teacher.create", "teacher", async (tx) => {
      // Re-read inside the transaction: the code check and the stale check see committed state.
      const others = await tx.select({ id: teachers.id, shortCode: teachers.shortCode, fullName: teachers.fullName }).from(teachers)
        .where(sql`upper(${teachers.shortCode}) = ${values.shortCode}`);
      const clash = shortCodeClash(values.shortCode, others, existing?.id ?? null);
      if (clash) throw new FieldProblem("shortCode", `${clash.shortCode} is already used by ${clash.fullName}.`);
      const now = new Date();
      if (!existing) {
        const [row] = await tx.insert(teachers).values({ ...values, phonePrivate: values.phonePrivate ?? null, status: "active", updatedAt: now }).returning({ id: teachers.id });
        const change = teacherChanges({}, values);
        return { result: { id: row.id, changed: change.fields.length }, entityId: row.id, after: change.after, detail: { phoneChanged: change.phoneChanged } };
      }
      const [current] = await tx.select().from(teachers).where(eq(teachers.id, existing.id)).for("update");
      if (!current || !matches(current.updatedAt, field(formData, "expectedUpdatedAt"))) throw new StaleProblem();
      const change = teacherChanges(current, values);
      const status = resolving ? NEXT_STATUS.resolve! : current.status;
      await tx.update(teachers).set({ ...values, status, updatedAt: now }).where(eq(teachers.id, current.id));
      return {
        result: { id: current.id, changed: change.fields.length },
        entityId: current.id,
        before: resolving ? { ...change.before, status: current.status } : change.before,
        after: resolving ? { ...change.after, status } : change.after,
        detail: { fields: change.fields, phoneChanged: change.phoneChanged },
      };
    });
    refresh(result.id);
    if (!existing) return succeeded(`Teacher added: ${values.shortCode} · ${values.fullName}.`, { entityId: result.id });
    if (resolving) return succeeded(`${values.shortCode} is now recorded as ${values.fullName}. Its classes are unchanged.`, { entityId: result.id });
    return succeeded(result.changed ? `Saved ${result.changed} change${result.changed === 1 ? "" : "s"} to ${values.shortCode}.` : "Nothing changed.", { entityId: result.id });
  } catch (error) {
    if (error instanceof FieldProblem) return invalid("Check the highlighted fields.", { [error.field]: [error.message] });
    if (error instanceof StaleProblem) return stale(CHANGED);
    if (isUniqueViolation(error)) return invalid("Check the highlighted fields.", { shortCode: ["That short code was just taken by another teacher."] });
    throw error;
  }
}

const STATUS_MESSAGES: Record<"set_on_leave" | "back_from_leave" | "deactivate" | "reactivate", (code: string) => string> = {
  set_on_leave: (code) => `${code} is on leave. Classes and allocations are unchanged.`,
  back_from_leave: (code) => `${code} is back from leave.`,
  deactivate: (code) => `${code} deactivated. They are listed under Inactive and no longer offered when assigning classes.`,
  reactivate: (code) => `${code} is active again.`,
};

/** Set on leave, back from leave, deactivate or reactivate. */
export async function setTeacherStatusAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const who = await editor();
  if (isResult(who)) return who;
  const action = field(formData, "action") as keyof typeof STATUS_MESSAGES;
  if (!(action in STATUS_MESSAGES)) return invalid("Choose what to change.");
  const teacherId = Number(field(formData, "teacherId"));
  const reason = field(formData, "reason").trim().slice(0, 300) || null;

  try {
    const code = await auditedChange(`teacher.${action}`, "teacher", async (tx) => {
      const [current] = await tx.select().from(teachers).where(eq(teachers.id, teacherId)).for("update");
      if (!current) throw new StaleProblem(MISSING, "missing");
      if (!matches(current.updatedAt, field(formData, "expectedUpdatedAt"))) throw new StaleProblem();
      if (!allowedFrom(action, current.status)) throw new ConflictProblem(transitionRefusal(action, current.status));
      if (action === "deactivate") {
        const blockers = deactivationBlockers(await getTeacherReferences(current.id, current.shortCode, tx));
        if (blockers.length) throw new ConflictProblem(`${current.shortCode} still has work this term. Reassign it first.`, blockers.map((item) => ({ severity: "blocker" as const, title: item.label, detail: item.detail })));
      }
      const status = NEXT_STATUS[action]!;
      await tx.update(teachers).set({ status, updatedAt: new Date() }).where(eq(teachers.id, current.id));
      return { result: current.shortCode, entityId: current.id, before: { status: current.status }, after: { status }, detail: reason ? { reason } : null };
    });
    refresh(teacherId);
    return succeeded(STATUS_MESSAGES[action](code), { entityId: teacherId });
  } catch (error) {
    if (error instanceof StaleProblem) return stale(error.message, error.reason);
    if (error instanceof ConflictProblem) return conflicted(error.message, error.issues);
    throw error;
  }
}

/** Permanently delete a record that nothing has ever referred to. The typed code must match. */
export async function deleteTeacherAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const who = await editor();
  if (isResult(who)) return who;
  const teacherId = Number(field(formData, "teacherId"));
  try {
    const code = await auditedChange("teacher.delete", "teacher", async (tx) => {
      const [current] = await tx.select().from(teachers).where(eq(teachers.id, teacherId)).for("update");
      if (!current) throw new StaleProblem(MISSING, "missing");
      if (!matches(current.updatedAt, field(formData, "expectedUpdatedAt"))) throw new StaleProblem();
      if (field(formData, "confirmCode").trim().toUpperCase() !== current.shortCode.toUpperCase()) {
        throw new FieldProblem("confirmCode", `Type ${current.shortCode} to confirm.`);
      }
      const refusals = deletionRefusals(await getTeacherReferences(current.id, current.shortCode, tx));
      if (refusals.length) throw new ConflictProblem(`${current.shortCode} can't be deleted. ${isPlaceholder(current.status) ? "" : "Deactivate it instead."}`.trim(), refusals.map((detail) => ({ severity: "blocker" as const, title: "In use", detail })));
      await tx.delete(teachers).where(eq(teachers.id, current.id));
      const { phonePrivate: _private, updatedAt: _updated, ...kept } = current;
      return { result: current.shortCode, entityId: current.id, before: { ...kept, advisoryLoadUnits: current.advisoryLoadUnits }, detail: { phoneChanged: current.phonePrivate != null } };
    });
    refresh();
    return succeeded(`${code} deleted.`, { entityId: null });
  } catch (error) {
    if (error instanceof FieldProblem) return invalid("Check the highlighted field.", { [error.field]: [error.message] });
    if (error instanceof StaleProblem) return stale(error.message, error.reason);
    if (error instanceof ConflictProblem) return conflicted(error.message, error.issues);
    throw error;
  }
}

class FieldProblem extends Error {
  constructor(readonly field: string, message: string) { super(message); }
}
class StaleProblem extends Error {
  constructor(message = CHANGED, readonly reason: "changed" | "missing" = "changed") { super(message); }
}
type Blocker = { severity: "blocker"; title: string; detail: string };
class ConflictProblem extends Error {
  readonly issues: Blocker[];
  constructor(message: string, issues: Blocker[] = []) {
    super(message);
    this.issues = issues.length ? issues : [{ severity: "blocker", title: "Not available", detail: message }];
  }
}

/** A refusal that is not a field error: a conflict with the reason as its one blocking issue. */
const refused = (message: string) => conflicted(message, [{ severity: "blocker", title: "Not available", detail: message }]);

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}
