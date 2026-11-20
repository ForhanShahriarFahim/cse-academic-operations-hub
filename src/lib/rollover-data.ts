import { eq } from "drizzle-orm";
import { db, inDatabaseTransaction } from "@/db";
import { academicTerms, termRollovers } from "@/db/schema";
import { authorize, can } from "./auth";
import { cohortScope } from "./batch-store";
import { lockTermContext } from "./term-lock";
import { rolloverCommitmentCandidates, rolloverSource } from "./rollover-store";
import { readTermContext } from "./term-context";

export async function getRolloverWorkspace(targetId: number, sourceId?: number) {
  const actor = await authorize("manage_terms");
  return db.transaction(tx => inDatabaseTransaction(tx, async () => {
    await lockTermContext(tx,"share");
    const scope = await cohortScope(tx);
    // Missing CSE has no valid management scope; a nonexistent scope never grants access.
    const resource = {kind:"department" as const,departmentId:scope ?? -1};
    await authorize("manage_terms",resource); await authorize("manage_batches",resource);
    if (scope == null) return null;
    const terms = await tx.select().from(academicTerms).orderBy(academicTerms.startDate,academicTerms.id);
    const target = terms.find(t => t.id === targetId); if (!target) return null;
    const source = terms.find(t => t.id === sourceId && t.id !== targetId && ["active","completed"].includes(t.status));
    const sourceData = source ? await rolloverSource(tx,source.id) : null;
    const [receipt] = await tx.select().from(termRollovers).where(eq(termRollovers.targetTermId,targetId));
    const canCarry = await can(actor, "manage_external_commitments");
    const commitments = canCarry && source && !receipt && target.status === "draft"
      ? (await rolloverCommitmentCandidates(tx, source.id)).map(({ id, label, bounded, canDate, exclusion }) => ({ id, label, bounded, canDate, exclusion })) : [];
    const context = await readTermContext(tx);
    return { target, sources:terms.filter(t => t.id !== targetId && ["active","completed"].includes(t.status)).map(t => ({id:t.id,name:t.name,status:t.status,startDate:t.startDate,endDate:t.endDate})), sourceId:source?.id ?? null,
      sourceName:source?.name ?? null, cohorts:sourceData?.cohorts ?? [], unplaced:sourceData?.unplaced ?? [],
      commitments,
      receipt:receipt ? {...receipt,summary:{ ...receipt.summary, commitments: canCarry ? receipt.summary.commitments : undefined },createdAt:receipt.createdAt.toISOString()} : null,
      activeName:context.state.kind === "one" ? context.state.term.name : context.state.kind === "none" ? "None" : "Unavailable" };
  }));
}

/** Internal read-only summary. Reasons/actors/operational metadata are editor-only. */
export async function getRolloverSummary(targetId: number) {
  await authorize("view_internal_portal");
  const [row] = await db.select().from(termRollovers).where(eq(termRollovers.targetTermId,targetId));
  if (!row) return null;
  return {source:row.summary.source,createdAt:row.createdAt.toISOString(),placements:row.summary.decisions.filter(d => d.destinationSemester != null).length,
    held:row.summary.decisions.filter(d => d.disposition === "hold").length,graduated:row.summary.decisions.filter(d => d.disposition === "graduate").length};
}
