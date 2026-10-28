"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { actionActor } from "./auth/action-guard";
import { invalid, type ActionResult } from "./action-result";
import { saveRoomInTransaction, type RoomResult } from "./room-transaction";
import { getRoomChanges } from "./room-data";
import { positiveInteger } from "./room-records";

export async function loadRoomChangesAction(roomId: number, before: number) {
  // Loader enforces editor access before reading history; validate client cursor too.
  if (typeof roomId !== "number" || typeof before !== "number" || !positiveInteger(String(roomId)) || !positiveInteger(String(before))) throw new Error("Invalid room history request.");
  return getRoomChanges(roomId, before);
}

export async function saveRoomAction(_previous: ActionResult | null, formData: FormData): Promise<RoomResult> {
  const actor = await actionActor("manage_rooms");
  if ("ok" in actor) return actor;
  const raw: Record<string, unknown> = Object.fromEntries(formData);
  raw.capabilities = formData.getAll("capabilities");
  let result: RoomResult;
  try { result = await db.transaction((tx) => saveRoomInTransaction(tx, actor, raw)); }
  catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return invalid("Check the highlighted fields.", { code: ["This room code is already in use, including inactive rooms."] });
    return invalid("The room could not be saved. Your input is kept. Try again.");
  }
  if (result.ok && result.message !== "Nothing changed.") revalidatePath("/", "layout");
  return result;
}
