/** Database-free shared lock protocol, safe for injected disposable adapters. */
import { eq } from "drizzle-orm";
import { termContext } from "@/db/schema";
import type { TermReader } from "./term-context";
import { ActiveTermUnavailable } from "./term-state";
export async function lockTermContext(reader: TermReader, mode: "share" | "exclusive") {
  const rows = mode === "share"
    ? await reader.select().from(termContext).where(eq(termContext.id, 1)).for("share")
    : await reader.select().from(termContext).where(eq(termContext.id, 1)).for("update");
  if (!rows.length) throw new ActiveTermUnavailable("context");
  return rows[0];
}
