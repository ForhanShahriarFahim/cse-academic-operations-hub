"use server";
import { revalidatePath } from "next/cache";
import { db, inDatabaseTransaction } from "@/db";
import { actionActor } from "./auth/action-guard";
import { denied, invalid, stale, succeeded, type ActionResult } from "./action-result";
import { cohortScope } from "./batch-store";
import { lockTermContext } from "./term-lock";
import { parseRolloverPlan, type RolloverReview } from "./rollover";
import { lockRolloverRows, rolloverEvidence, RolloverRefusal, writeRollover } from "./rollover-store";

export interface RolloverResult extends ActionResult { review?: RolloverReview; receiptId?: number }
export async function prepareRolloverAction(_previous: RolloverResult | null, form: FormData): Promise<RolloverResult> {
  const initial = await actionActor("manage_terms"); if ("ok" in initial) return initial;
  if (!(form instanceof FormData)) return invalid("Submit a valid preparation form.");
  const keys = ["sourceId","targetId","choices","cloneGrid","reason","command","fingerprint","confirmation","acknowledge"];
  const raw: Record<string,string> = {};
  for (const [key,value] of form.entries()) {
    if (key.startsWith("$ACTION_")) continue;
    if (!keys.includes(key) || key in raw || typeof value !== "string") return invalid("Submit each supported field once as text.");
    raw[key] = value;
  }
  if (!["preview","commit"].includes(raw.command)) return invalid("Choose review or confirmation.");
  let plan: ReturnType<typeof parseRolloverPlan>;
  try { plan = parseRolloverPlan(raw); } catch (e) { return invalid((e as Error).message); }
  try {
    return await db.transaction(tx => inDatabaseTransaction(tx, async () => {
      await lockTermContext(tx,raw.command === "commit" ? "exclusive" : "share");
      const scope = await cohortScope(tx); if (scope == null) return denied("CSE cohort scope is unavailable.","forbidden");
      const resource = {kind:"department" as const,departmentId:scope};
      const actor = await actionActor("manage_terms",resource); if ("ok" in actor) return actor;
      const batchActor = await actionActor("manage_batches",resource); if ("ok" in batchActor) return batchActor;
      if (raw.command === "commit") await lockRolloverRows(tx,plan);
      const evidence = await rolloverEvidence(tx,plan);
      if (raw.command === "preview") return {...succeeded("Review ready. No records have been changed."),review:evidence.review};
      if (raw.fingerprint !== evidence.review.fingerprint) return {...stale("The preparation evidence changed. Your decisions are kept; review the latest values and confirm again."),review:evidence.review};
      if (raw.confirmation !== `${evidence.target.name} · ${evidence.target.academicYear}` || raw.acknowledge !== "on") return invalid("Type the destination identity and acknowledge the preparation effect.",{confirmation:["Enter the exact destination identity shown in the review."],acknowledge:["Acknowledge the reviewed one-time preparation."]});
      const receiptId = await writeRollover(tx,actor,plan,evidence);
      revalidatePath("/","layout");
      return {...succeeded("Draft preparation saved. Activation is a separate review.",{entityId:plan.targetId}),receiptId};
    }));
  } catch (e) {
    if (e instanceof RolloverRefusal) return invalid(e.message);
    // The person sees a safe message; the server keeps the cause for diagnosis.
    console.error("Rollover preparation failed and was rolled back", e);
    return invalid("Preparation could not be saved. No changes were committed. Your input is kept; review and try again.");
  }
}
