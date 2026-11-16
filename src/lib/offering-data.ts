import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, departments } from "@/db/schema";
import { redirect } from "next/navigation";
import { authorize, getOptionalActor, hasCapability, type Actor } from "./auth";
import { cohortRead } from "./term-context";
import { offeringInteger } from "./offering-records";
import { termOfferings } from "./offering-store";

async function offeringEditor(actor: Actor) {
  const [scope] = await db.select({ id: departments.id }).from(departments).where(eq(departments.code, "CSE"));
  return hasCapability(actor, "manage_offerings", scope?.id ?? null);
}

/** Editor-only pages: sign in first, then require the offering capability in CSE planning scope. */
export async function requireOfferingEditor(next: string) {
  const actor = await getOptionalActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!await offeringEditor(actor)) redirect("/forbidden");
  return actor;
}

/** Every internal viewer reads the term's offerings and comparison; `editor` gates controls only. */
export async function getTermOfferings(termValue: string, sourceValue?: string) {
  const actor = await authorize("view_internal_portal");
  const termId = offeringInteger(termValue); if (!termId) return null;
  const sourceId = sourceValue ? offeringInteger(sourceValue) : null;
  return cohortRead(async () => {
    const view = await termOfferings(db, termId, sourceId);
    if (!view) return null;
    const editor = await offeringEditor(actor);
    return { ...view, editor, canEdit: editor && view.editable };
  });
}

export interface OfferingChange { id: number; at: string; actor: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string | null; cohort: string | null; course: string | null; source: string | null; created: Array<{ cohort: string; course: string }> }
export async function getOfferingChanges(termId: number, before?: number): Promise<{ changes: OfferingChange[]; next: number | null }> {
  const actor = await authorize("view_internal_portal");
  if (!await offeringEditor(actor)) throw new Error("Offering history is available to offering editors only.");
  if (!offeringInteger(String(termId)) || before !== undefined && !offeringInteger(String(before))) throw new Error("Invalid offering history cursor.");
  const base = and(eq(auditEvents.entity, "term_offerings"), eq(auditEvents.entityId, termId));
  const [cursor] = before ? await db.select().from(auditEvents).where(and(base, eq(auditEvents.id, before))) : [];
  if (before && !cursor) throw new Error("This cursor does not belong to this term.");
  const rows = await db.select().from(auditEvents).where(and(base, cursor ? or(lt(auditEvents.at, cursor.at), and(eq(auditEvents.at, cursor.at), lt(auditEvents.id, cursor.id))) : undefined)).orderBy(desc(auditEvents.at), desc(auditEvents.id)).limit(21);
  const text = (value: unknown) => typeof value === "string" ? value : null;
  return {
    changes: rows.slice(0, 20).map(row => {
      const detail = (row.detail ?? {}) as Record<string, unknown>;
      const created = Array.isArray(detail.offerings) ? detail.offerings.flatMap(item => item && typeof item === "object" && typeof (item as { cohort?: unknown }).cohort === "string" && typeof (item as { course?: unknown }).course === "string" ? [{ cohort: (item as { cohort: string }).cohort, course: (item as { course: string }).course }] : []) : [];
      return { id: row.id, at: row.at.toISOString(), actor: row.actorDisplayName ?? row.actor, action: row.action, before: row.before as Record<string, unknown> | null, after: row.after as Record<string, unknown> | null, reason: text(detail.reason), cohort: text(detail.cohort), course: text(detail.course), source: text(detail.sourceTerm), created };
    }),
    next: rows.length > 20 ? rows[19].id : null,
  };
}
