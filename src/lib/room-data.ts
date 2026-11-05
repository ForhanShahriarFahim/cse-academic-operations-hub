import { and, desc, eq, lt, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditEvents, departments, rooms } from "@/db/schema";
import { authorize, can, getOptionalActor } from "./auth";
import { positiveInteger } from "./room-records";
import { readRoomLifecycleEvidence } from "./room-lifecycle-transaction";
import { cohortRead } from "./term-context";
export async function getRoomLifecycleEvidence(room: { id: number; code: string }) {
  await authorize("manage_rooms");
  return cohortRead(()=>readRoomLifecycleEvidence(db, room));
}

export async function requireRoomEditor(next: string) {
  const actor = await getOptionalActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!await can(actor, "manage_rooms")) redirect("/forbidden");
  return actor;
}
export async function getRoomRecord(id: string) {
  await authorize("view_internal_portal");
  const parsed = positiveInteger(id);
  if (!parsed) return null;
  return (await db.select().from(rooms).where(eq(rooms.id, parsed)))[0] ?? null;
}
export async function roomDepartments() {
  await authorize("manage_rooms");
  return db.select().from(departments).orderBy(departments.code);
}
export interface RoomChange {
  id: number; at: string; actor: string; action: string;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  warnings: Array<{ title: string; detail: string }>;
  reason: string | null;
}
export async function getRoomChanges(roomId: number, before?: number): Promise<{ changes: RoomChange[]; next: number | null }> {
  await authorize("manage_rooms");
  const base = and(eq(auditEvents.entity, "room"), eq(auditEvents.entityId, roomId));
  const [cursor] = before ? await db.select().from(auditEvents).where(and(base, eq(auditEvents.id, before))) : [];
  const rows = await db.select().from(auditEvents).where(and(base, cursor ? or(lt(auditEvents.at, cursor.at), and(eq(auditEvents.at, cursor.at), lt(auditEvents.id, cursor.id))) : undefined))
    .orderBy(desc(auditEvents.at), desc(auditEvents.id)).limit(21);
  return { changes: rows.slice(0, 20).map((row) => ({ id: row.id, at: row.at.toISOString(), actor: row.actorDisplayName ?? row.actor, action: row.action,
    before: row.before as Record<string, unknown> | null, after: row.after as Record<string, unknown> | null,
    warnings: (row.detail as { acknowledgedWarnings?: RoomChange["warnings"] } | null)?.acknowledgedWarnings ?? [],
    reason: (row.detail as { reason?: string } | null)?.reason ?? null,
  })), next: rows.length > 20 ? rows[19].id : null };
}
