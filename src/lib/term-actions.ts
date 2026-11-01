"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, inDatabaseTransaction } from "@/db";
import { academicTerms, academicPolicies } from "@/db/schema";
import { auditedChange } from "./auth/audit";
import { guardAction } from "./auth/action-guard";
import { invalid, stale, succeeded, type ActionResult } from "./action-result";
import { withTermContext } from "./active-term";
import { lockTermContext, advanceTermGeneration } from "./term-context";
import { activationEvidence, getTermSummary, hasIdentityDuplicate } from "./term-data";
import { termIdentityKey, validateStartingPolicy, validateTermFields } from "./term-records";

async function managedWrite(mode: "share" | "exclusive", work: () => Promise<ActionResult>) {
  const denied = await guardAction("manage_terms");
  if (denied) return denied;
  return withTermContext(() => db.transaction(tx => inDatabaseTransaction(tx, async () => {
    await lockTermContext(tx, mode);
    const denied = await guardAction("manage_terms");
    if (denied) return denied;
    return work();
  })));
}
const input = (form: FormData) => Object.fromEntries(form.entries());
const refresh = () => revalidatePath("/", "layout");

export async function createTermAction(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  return managedWrite("exclusive", async () => {
    const parsed = validateTermFields(input(form));
    if (!parsed.ok) return invalid("Check the highlighted fields.", parsed.errors);
    if (await hasIdentityDuplicate(parsed.fields.name, parsed.fields.academicYear)) return invalid("That term already exists.", { name: ["Use a different name or academic year."] });
    const id = await auditedChange("term.create", "academic_term", async tx => {
      const [row] = await tx.insert(academicTerms).values({ ...parsed.fields, status: "draft", managedSetup: true }).returning();
      return { result: row.id, entityId: row.id, after: row };
    });
    refresh(); return succeeded("Draft term saved. Set its starting policy before reviewing activation.", { entityId: id });
  });
}

export async function editTermAction(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  return managedWrite("exclusive", async () => {
    const id = Number(form.get("termId"));
    const summary = await getTermSummary(id);
    if (!summary || summary.term.revision !== Number(form.get("revision"))) return stale("The term changed. Refresh before editing.");
    if (!summary.editable) return stale("Only an unused draft can be edited here.");
    const parsed = validateTermFields(input(form));
    if (!parsed.ok) return invalid("Check the highlighted fields.", parsed.errors);
    const { name, academicYear } = parsed.fields;
    if (termIdentityKey(name, academicYear) !== termIdentityKey(summary.term.name, summary.term.academicYear)
      && await hasIdentityDuplicate(name, academicYear, id)) return invalid("That term already exists.", { name: ["Use a different name or academic year."] });
    await auditedChange("term.update", "academic_term", async tx => {
      const [row] = await tx.update(academicTerms).set({ ...parsed.fields, revision: sql`${academicTerms.revision} + 1` }).where(eq(academicTerms.id, id)).returning();
      return { result: null, entityId: id, before: summary.term, after: row };
    });
    refresh(); return succeeded("Draft term details saved.", { entityId: id });
  });
}

export async function saveStartingPolicyAction(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  return managedWrite("share", async () => {
    const denied = await guardAction("manage_policy"); if (denied) return denied;
    const id = Number(form.get("termId"));
    if (!Number.isSafeInteger(id) || id < 1) return invalid("Select a valid draft term.");
    await db.select({ id: academicTerms.id }).from(academicTerms).where(eq(academicTerms.id, id)).for("update");
    const summary = await getTermSummary(id);
    if (!summary || summary.term.revision !== Number(form.get("revision"))) return stale("The draft changed. Refresh before saving its policy.");
    if (!summary.editable) return stale("The starting policy can only be edited on an unused draft.");
    const parsed = validateStartingPolicy(input(form));
    if (!parsed.ok) return invalid("Enter each starting-policy value explicitly.", parsed.errors);
    await auditedChange("term.policy.setup", "academic_term", async tx => {
      const [row] = await tx.insert(academicPolicies).values({ termId: id, ...parsed.values })
        .onConflictDoUpdate({ target: academicPolicies.termId, set: { ...parsed.values, updatedAt: new Date() } }).returning();
      await tx.update(academicTerms).set({ revision: sql`${academicTerms.revision} + 1` }).where(eq(academicTerms.id, id));
      return { result: null, entityId: id, before: summary.policy, after: row };
    });
    refresh(); return succeeded("Starting policy saved explicitly. Review activation when ready.", { entityId: id });
  });
}

export async function activateTermAction(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  return managedWrite("exclusive", async () => {
    const id = Number(form.get("termId"));
    const reason = String(form.get("reason") ?? "").trim();
    if (!reason || reason.length > 500 || form.get("acknowledge") !== "on") return invalid("Enter a reason and acknowledge the activation effect.", {
      ...(!reason || reason.length > 500 ? { reason: ["Enter a reason of 1–500 characters."] } : {}),
      ...(form.get("acknowledge") !== "on" ? { acknowledge: ["Acknowledge the effect on the named target and public routine."] } : {}),
    });
    const review = await activationEvidence(id);
    if (!review) return stale("The target term is unavailable. Refresh the term directory.");
    if (review.context.state.kind === "ambiguous") return stale("Academic term configuration is unavailable. Contact the portal administrator.");
    if (review.target.term.status !== "draft" || !review.target.ready) return stale("Only a valid draft with an explicitly saved starting policy can be activated.");
    if (String(form.get("fingerprint") ?? "") !== review.fingerprint
      || Number(form.get("generation")) !== review.context.generation
      || String(form.get("previousActiveId") ?? "") !== String(review.active?.term.id ?? "")
      || Number(form.get("revision")) !== review.target.term.revision) return stale("Review changed; refresh activation review. No term statuses were changed.");
    await auditedChange("term.activate", "academic_term", async tx => {
      if (review.active) await tx.update(academicTerms).set({ status: "completed", revision: sql`${academicTerms.revision} + 1` })
        .where(and(eq(academicTerms.id, review.active.term.id), eq(academicTerms.status, "active")));
      await tx.update(academicTerms).set({ status: "active", revision: sql`${academicTerms.revision} + 1` }).where(eq(academicTerms.id, id));
      await advanceTermGeneration(tx);
      return { result: null, entityId: id,
        before: { active: review.active?.term ?? null, target: review.target.term, generation: review.context.generation },
        after: { activeId: id, completedId: review.active?.term.id ?? null, generation: review.context.generation + 1 },
        detail: { reason, reviewFingerprint: review.fingerprint },
      };
    });
    refresh(); return succeeded(`${review.target.term.name} is now active. Previous publications and historical records are retained.`, { entityId: id });
  });
}
