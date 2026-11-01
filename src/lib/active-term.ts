/** Server reader shared by required, optional and transactional consumers. */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { academicTerms } from "@/db/schema";
import { ActiveTermUnavailable, classifyActiveTerms, TERM_ACTION_MESSAGE } from "./term-state";
import { stale, type ActionResult } from "./action-result";

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function readActiveTerm(reader: Reader = db) {
  return classifyActiveTerms(await reader.select().from(academicTerms).where(eq(academicTerms.status, "active")).limit(2));
}
export async function requireActiveTerm(reader: Reader = db) {
  const state = await readActiveTerm(reader);
  if (state.kind !== "one") throw new ActiveTermUnavailable(state.kind);
  return state.term;
}

/** Only expected term failures are converted; auth/redirect/DB errors keep their contract. */
export async function withTermContext(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try { return await work(); }
  catch (error) {
    if (error instanceof ActiveTermUnavailable) return stale(TERM_ACTION_MESSAGE);
    throw error;
  }
}
