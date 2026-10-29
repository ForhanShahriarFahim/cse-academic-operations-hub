import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { roomUnavailability } from "@/db/schema";
import { authorize } from "./auth";
import { positiveInteger } from "./room-records";

export async function getRoomMaintenance(roomId: number, page = 1) {
  await authorize("view_internal_portal");
  if (!positiveInteger(String(roomId)) || !positiveInteger(String(page))) throw new Error("Invalid maintenance page.");
  const condition = eq(roomUnavailability.roomId, roomId);
  const [total] = await db.select({ n: sql<number>`count(*)::integer` }).from(roomUnavailability).where(condition);
  const last = Math.max(1, Math.ceil(total.n / 20));
  const current = Math.min(page, last);
  const rows = await db.select().from(roomUnavailability).where(condition).orderBy(desc(roomUnavailability.startDate), desc(roomUnavailability.id)).limit(20).offset((current - 1) * 20);
  return { entries: rows.map(({ createdAt, updatedAt, ...r }) => ({ ...r, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() })), total: total.n, page: current, last };
}
export async function getMaintenanceForEdit(roomId: number, id: number) {
  await authorize("manage_rooms");
  if (!positiveInteger(String(roomId)) || !positiveInteger(String(id))) return null;
  const [row] = await db.select().from(roomUnavailability).where(and(eq(roomUnavailability.roomId, roomId), eq(roomUnavailability.id, id)));
  return row ? { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() } : null;
}
