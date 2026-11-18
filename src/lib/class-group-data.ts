import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, departments } from "@/db/schema";
import { redirect } from "next/navigation";
import { authorize, getOptionalActor, hasCapability, type Actor } from "./auth";
import { cohortRead } from "./term-context";
import { groupInteger } from "./class-group-records";
import { termClassGroups } from "./class-group-store";

async function classGroupEditor(actor: Actor) {
  const [scope] = await db.select({ id: departments.id }).from(departments).where(eq(departments.code, "CSE"));
  return hasCapability(actor, "manage_class_groups", scope?.id ?? null);
}

/** Editor-only pages: sign in first, then require the class-group capability in CSE planning scope. */
export async function requireClassGroupEditor(next: string) {
  const actor = await getOptionalActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!await classGroupEditor(actor)) redirect("/forbidden");
  return actor;
}

/** Every internal viewer reads the term's class groups; `editor` gates controls and the editor-only payload. */
export async function getTermClassGroups(termValue: string) {
  const actor = await authorize("view_internal_portal");
  const termId = groupInteger(termValue); if (!termId) return null;
  return cohortRead(async () => {
    const view = await termClassGroups(db, termId);
    if (!view) return null;
    const editor = await classGroupEditor(actor);
    // Review tokens, the teacher directory with totals and suggestions are editor payload.
    if (!editor) return { ...view, groups: view.groups.map(group => ({ ...group, fingerprint: "" })), teachers: [], suggestions: [], editor, canEdit: false };
    return { ...view, editor, canEdit: view.editable };
  });
}

export interface ClassGroupSnapshot { audience: string[]; externalLabel: string | null; externalCount: number | null; deliveryMode: string; requirement: { meetings: number; minutes: number | null; provisional: boolean } | null; teachers: Array<{ code: string; units: string }>; method: string | null; notes: string | null }
export interface ClassGroupChange { id: number; at: string; actor: string; action: string; course: string | null; audience: string | null; reason: string | null; before: ClassGroupSnapshot | null; after: ClassGroupSnapshot | null; started: { source: string; groups: Array<{ course: string; snapshot: ClassGroupSnapshot }> } | null }
const snapshotOf = (value: unknown): ClassGroupSnapshot | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>, text = (item: unknown) => typeof item === "string" ? item : null, number = (item: unknown) => typeof item === "number" ? item : null;
  const requirement = raw.requirement && typeof raw.requirement === "object" ? raw.requirement as Record<string, unknown> : null;
  return {
    audience: Array.isArray(raw.audience) ? raw.audience.filter((item): item is string => typeof item === "string") : [],
    externalLabel: text(raw.externalLabel), externalCount: number(raw.externalCount), deliveryMode: text(raw.deliveryMode) ?? "fixed",
    requirement: requirement ? { meetings: number(requirement.meetings) ?? 0, minutes: number(requirement.minutes), provisional: requirement.provisional === true } : null,
    teachers: Array.isArray(raw.teachers) ? raw.teachers.flatMap(item => item && typeof item === "object" && typeof (item as { code?: unknown }).code === "string" && typeof (item as { units?: unknown }).units === "string" ? [{ code: (item as { code: string }).code, units: (item as { units: string }).units }] : []) : [],
    method: text(raw.method), notes: text(raw.notes),
  };
};
export async function getClassGroupChanges(termId: number, before?: number): Promise<{ changes: ClassGroupChange[]; next: number | null }> {
  const actor = await authorize("view_internal_portal");
  if (!await classGroupEditor(actor)) throw new Error("Class-group history is available to class-group editors only.");
  if (!groupInteger(String(termId)) || before !== undefined && !groupInteger(String(before))) throw new Error("Invalid class-group history cursor.");
  const base = and(eq(auditEvents.entity, "term_class_groups"), eq(auditEvents.entityId, termId));
  const [cursor] = before ? await db.select().from(auditEvents).where(and(base, eq(auditEvents.id, before))) : [];
  if (before && !cursor) throw new Error("This cursor does not belong to this term.");
  const rows = await db.select().from(auditEvents).where(and(base, cursor ? or(lt(auditEvents.at, cursor.at), and(eq(auditEvents.at, cursor.at), lt(auditEvents.id, cursor.id))) : undefined)).orderBy(desc(auditEvents.at), desc(auditEvents.id)).limit(21);
  const text = (value: unknown) => typeof value === "string" ? value : null;
  return {
    changes: rows.slice(0, 20).map(row => {
      const detail = (row.detail ?? {}) as Record<string, unknown>;
      const after = row.after as { groups?: unknown } | null;
      const started = row.action === "term_class_groups.start" && Array.isArray(after?.groups) ? {
        source: text(detail.sourceTerm) ?? "Earlier term",
        groups: (after.groups as unknown[]).flatMap(item => {
          if (!item || typeof item !== "object" || !("course" in item) || typeof item.course !== "string") return [];
          const snapshot = snapshotOf(item);
          return snapshot ? [{ course: item.course, snapshot }] : [];
        }),
      } : null;
      return { id: row.id, at: row.at.toISOString(), actor: row.actorDisplayName ?? row.actor, action: row.action, course: text(detail.course), audience: text(detail.audience), reason: text(detail.reason), before: snapshotOf(row.before), after: started ? null : snapshotOf(row.after), started };
    }),
    next: rows.length > 20 ? rows[19].id : null,
  };
}
