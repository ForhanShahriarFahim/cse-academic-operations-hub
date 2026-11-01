import { eq, sql } from "drizzle-orm";
import { db, inDatabaseTransaction } from "@/db";
import { academicTerms, termContext } from "@/db/schema";
import { ActiveTermUnavailable, classifyActiveTerms } from "./term-state";
import { parseTermWriteContext, type TermWriteContext } from "./term-context-value";
import type { ActionResult } from "./action-result";

export type TermReader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
export class TermContextChanged extends ActiveTermUnavailable {
  constructor(message = "The academic term changed. No changes were saved. Refresh this page before continuing.") {
    super("context"); this.message = message; this.name = "TermContextChanged";
  }
}

/** One SQL snapshot binds generation and active identity, including zero active. */
export async function readTermContext(reader: TermReader = db) {
  const rows = await reader.select({ generation: termContext.generation, term: academicTerms }).from(termContext)
    .leftJoin(academicTerms, eq(academicTerms.status, "active")).where(eq(termContext.id, 1)).limit(2);
  if (!rows.length) throw new ActiveTermUnavailable("context");
  return { generation: rows[0].generation, state: classifyActiveTerms(rows.flatMap(row => row.term ? [row.term] : [])) };
}
export async function captureActiveContext(reader: TermReader = db) {
  const current = await readTermContext(reader);
  if (current.state.kind !== "one") throw new ActiveTermUnavailable(current.state.kind);
  return { term: current.state.term, writeContext: { activeTermId: current.state.term.id, generation: current.generation } };
}
export async function assertTermContext(expected: TermWriteContext, reader: TermReader = db) {
  const current = await captureActiveContext(reader);
  if (current.writeContext.activeTermId !== expected.activeTermId || current.writeContext.generation !== expected.generation) {
    throw new TermContextChanged(`The active term changed to ${current.term.name}. No changes were saved. Refresh this page before continuing.`);
  }
  return current;
}
export async function lockTermContext(reader: TermReader, mode: "share" | "exclusive") {
  const rows = mode === "share"
    ? await reader.select().from(termContext).where(eq(termContext.id, 1)).for("share")
    : await reader.select().from(termContext).where(eq(termContext.id, 1)).for("update");
  if (!rows.length) throw new ActiveTermUnavailable("context");
  return rows[0];
}
export async function activeTermWrite(input: unknown, work: () => Promise<ActionResult>) {
  const expected = parseTermWriteContext(input);
  if (!expected) throw new TermContextChanged("This page has no valid academic term context. No changes were saved. Refresh before continuing.");
  return db.transaction(tx => inDatabaseTransaction(tx, async () => {
    await lockTermContext(tx, "share");
    await assertTermContext(expected, tx);
    return work();
  }));
}
export async function advanceTermGeneration(reader: TermReader) {
  await reader.update(termContext).set({ generation: sql`${termContext.generation} + 1` }).where(eq(termContext.id, 1));
}
