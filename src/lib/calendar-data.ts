import { and, desc, eq, lt, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { authorize, getOptionalActor, hasCapability, type Actor } from "./auth";
import { calendarInteger, readTermCalendar } from "./calendar-store";
import type { CalendarEntry, TeachingRange } from "./calendar-records";

/** Calendar facts apply across the term, so only a global (university-wide) assignment may edit. */
const calendarEditor = (actor: Actor) => hasCapability(actor, "manage_terms", null);

/** Editor-only pages: sign in first, then require global term management. */
export async function requireCalendarEditor(next: string) {
  const actor = await getOptionalActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!calendarEditor(actor)) redirect("/forbidden");
  return actor;
}

/** Every internal viewer can read and print a term calendar; `canEdit` gates controls. */
export async function getTermCalendar(termValue: string) {
  const actor = await authorize("view_internal_portal");
  const termId = calendarInteger(termValue);
  if (!termId) return null;
  const view = await readTermCalendar(db, termId);
  if (!view) return null;
  const editor = calendarEditor(actor);
  return { ...view, editor, canEdit: editor && view.editable };
}

export interface CalendarChange { id: number; at: string; actor: string; action: string; reason: string | null; title: string | null; before: unknown; after: unknown }
export async function getCalendarChanges(termId: number, before?: number): Promise<{ changes: CalendarChange[]; next: number | null }> {
  const actor = await authorize("view_internal_portal");
  if (!calendarEditor(actor)) throw new Error("Calendar history is available to term managers only.");
  if (!calendarInteger(String(termId)) || before !== undefined && !calendarInteger(String(before))) throw new Error("Invalid calendar history cursor.");
  const base = and(eq(auditEvents.entity, "term_calendar"), eq(auditEvents.entityId, termId));
  const [cursor] = before ? await db.select().from(auditEvents).where(and(base, eq(auditEvents.id, before))) : [];
  if (before && !cursor) throw new Error("This cursor does not belong to this term.");
  const rows = await db.select().from(auditEvents).where(and(base, cursor ? or(lt(auditEvents.at, cursor.at), and(eq(auditEvents.at, cursor.at), lt(auditEvents.id, cursor.id))) : undefined)).orderBy(desc(auditEvents.at), desc(auditEvents.id)).limit(21);
  const text = (value: unknown) => typeof value === "string" ? value : null;
  return {
    changes: rows.slice(0, 20).map(row => {
      const detail = (row.detail ?? {}) as Record<string, unknown>;
      return { id: row.id, at: row.at.toISOString(), actor: row.actorDisplayName ?? row.actor, action: row.action, reason: text(detail.reason), title: text(detail.title), before: row.before, after: row.after };
    }),
    next: rows.length > 20 ? rows[19].id : null,
  };
}

/** History rows carry stored JSON; read them defensively. */
export function storedTeaching(value: unknown): TeachingRange | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return typeof raw.start === "string" && typeof raw.end === "string" && typeof raw.source === "string" ? { start: raw.start, end: raw.end, source: raw.source, sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : null } : null;
}
export function storedEntry(value: unknown): Omit<CalendarEntry, "id"> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>, text = (item: unknown) => typeof item === "string" ? item : null;
  if (!text(raw.kind) || !text(raw.title) || !text(raw.startDate) || !text(raw.endDate) || !text(raw.source)) return null;
  return { kind: raw.kind as string, title: raw.title as string, startDate: raw.startDate as string, endDate: raw.endDate as string, regularClasses: text(raw.regularClasses), source: raw.source as string, sourceUrl: text(raw.sourceUrl) };
}
