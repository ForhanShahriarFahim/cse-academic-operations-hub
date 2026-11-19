"use server";

/**
 * SET-01B — propose, approve, reject and withdraw policy versions (spec D-3).
 * Every write runs in the shared term-context transaction, serializes per term
 * with an advisory lock, rechecks the decision evidence and audits atomically.
 */
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { academicPolicies, academicPolicyVersions } from "@/db/schema";
import { withActiveTermContext } from "./active-term";
import { auditedChange } from "./auth/audit";
import { actionActor } from "./auth/action-guard";
import { conflicted, denied, invalid, stale, succeeded, type ActionResult } from "./action-result";
import type { TermWriteContext } from "./term-context-value";
import { getActiveTerm, getPortalData } from "./data";
import { dhakaToday } from "./room-lifecycle";
import { changedFields, parseNote, type PolicyImpact, validateProposal, versionLabel, versionOn, REASON_LIMIT, SHORT_LABELS, VERSION_FIELDS } from "./policy-versions";
import { impactInput, loadTermPolicy, lockTermPolicy, proposalImpact } from "./policy-store";

const refresh = () => revalidatePath("/", "layout");
const IMPACT_CHANGED = "Impact changed; review again. Nothing was saved.";

const lockPolicy = (termId: number) => lockTermPolicy(termId, "exclusive");
export async function proposePolicyChangeAction(formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withActiveTermContext(() => proposeInTerm(formData), context ?? formData);
}
async function proposeInTerm(formData: FormData): Promise<ActionResult> {
  if (!(formData instanceof FormData)) return invalid("Submit a valid policy form.");
  const actor = await actionActor("manage_policy");
  if ("ok" in actor) return actor;
  const term = await getActiveTerm();
  await lockPolicy(term.id);
  const policy = await loadTermPolicy(term.id);
  if (!policy) return stale("The active term is unavailable. Refresh the page.", "missing");
  if (policy.open) {
    const message = "Another policy proposal is already waiting for a decision. Withdraw or decide it first.";
    return conflicted(message, [{ severity: "blocker", title: "One open proposal per term", detail: message }]);
  }
  const fields = Object.fromEntries([...VERSION_FIELDS, "effectiveFrom", "reason"].map((key) => [key, formData.get(key)]));
  const parsed = validateProposal(fields, term, policy.timeline);
  if (!parsed.ok) return invalid(parsed.errors.form?.[0] ?? "Check the highlighted policy fields.", parsed.errors);
  const { effectiveFrom, figures, reason } = parsed.value;
  const { impact, fingerprint } = proposalImpact(policy, { effectiveFrom, figures }, await impactInput(await getPortalData(), dhakaToday()));
  const values = Object.fromEntries(VERSION_FIELDS.map((key) => [key, String(figures[key])])) as Record<typeof VERSION_FIELDS[number], string>;
  const id = await auditedChange("policy.propose", "academic_policy_version", async (tx) => {
    const [row] = await tx.insert(academicPolicyVersions).values({
      termId: term.id, effectiveFrom, ...values, reason, proposedByUserId: actor.id, proposalFingerprint: fingerprint,
    }).returning();
    return { result: row.id, entityId: row.id, after: row, detail: { termId: term.id, baseline: !policy.timeline, impact } };
  });
  refresh();
  return succeeded(policy.timeline
    ? "Proposal saved. Nothing changes until a second administrator approves it."
    : "Baseline proposal saved. Payments and marks stay unpriced until a second administrator approves it.", { entityId: id });
}

export type PolicyPreview = ActionResult & { preview?: { effectiveFrom: string; impact: PolicyImpact | null; baseline: boolean; changed: string[] } };

/** Read-only: validate a draft proposal and show its impact. Nothing is written. */
export async function previewPolicyChangeAction(formData: FormData, context?: TermWriteContext): Promise<PolicyPreview> {
  let preview: PolicyPreview["preview"];
  const result = await withActiveTermContext(async () => {
    if (!(formData instanceof FormData)) return invalid("Submit a valid policy form.");
    const actor = await actionActor("manage_policy");
    if ("ok" in actor) return actor;
    const term = await getActiveTerm();
    const policy = await loadTermPolicy(term.id);
    if (!policy) return stale("The active term is unavailable. Refresh the page.", "missing");
    const fields = Object.fromEntries([...VERSION_FIELDS, "effectiveFrom", "reason"].map((key) => [key, formData.get(key)]));
    const parsed = validateProposal(fields, term, policy.timeline);
    if (!parsed.ok) return invalid(parsed.errors.form?.[0] ?? "Check the highlighted policy fields.", parsed.errors);
    const { effectiveFrom, figures } = parsed.value;
    const { impact } = proposalImpact(policy, { effectiveFrom, figures }, await impactInput(await getPortalData(), dhakaToday()));
    const changed = policy.timeline ? changedFields(versionOn(policy.timeline, effectiveFrom).figures, figures).map((key) => SHORT_LABELS[key]) : [];
    preview = { effectiveFrom, impact, baseline: !policy.timeline, changed };
    return succeeded("Impact preview ready. Nothing has been saved.");
  }, context ?? formData);
  return preview && result.ok ? { ...result, preview } : result;
}

export type PolicyDecision = { command: "approve" | "reject" | "withdraw"; note?: string | null; fingerprint?: string };

export async function decidePolicyChangeAction(versionId: number, decision: PolicyDecision, context?: TermWriteContext): Promise<ActionResult> {
  return withActiveTermContext(() => decideInTerm(versionId, decision), context);
}
async function decideInTerm(versionId: number, decision: PolicyDecision): Promise<ActionResult> {
  const command = decision?.command;
  if (!Number.isSafeInteger(versionId) || versionId < 1 || !["approve", "reject", "withdraw"].includes(command)) return invalid("Policy request is invalid.");
  const actor = await actionActor(command === "withdraw" ? "manage_policy" : "approve_policy");
  if ("ok" in actor) return actor;
  const note = parseNote(decision.note, command === "reject");
  if (note === undefined) {
    const message = command === "reject" ? `Enter a note of 1–${REASON_LIMIT} characters explaining the rejection.` : `Keep the note to ${REASON_LIMIT} characters or fewer.`;
    return invalid(message, { note: [message] });
  }
  const term = await getActiveTerm();
  await lockPolicy(term.id);
  const policy = await loadTermPolicy(term.id);
  const row = policy?.history.find((item) => item.id === versionId);
  if (!policy || !row) return stale("That proposal is not part of the active term. Refresh the page.", "missing");
  if (row.status !== "proposed") return stale(`That proposal was already ${row.status}. Refresh to see the current policy.`);
  if (command === "withdraw" && row.proposedById !== actor.id) return denied("Only the person who proposed this change can withdraw it.", "forbidden");
  if (command !== "withdraw" && row.proposedById === actor.id) {
    return denied("You proposed this change, so another person with policy approval must decide it.", "forbidden");
  }
  let fingerprint: string | null = null;
  if (command !== "withdraw") {
    const proposal = { effectiveFrom: row.effectiveFrom, figures: row.figures };
    fingerprint = proposalImpact(policy, proposal, await impactInput(await getPortalData(), dhakaToday())).fingerprint;
    if (typeof decision.fingerprint !== "string" || decision.fingerprint !== fingerprint) return stale(IMPACT_CHANGED);
  }
  const baseline = !policy.timeline;
  const version = command === "approve" ? (baseline ? 1 : Math.max(1, ...policy.history.map((item) => item.version ?? 0)) + 1) : null;
  const status = command === "approve" ? "approved" : command === "reject" ? "rejected" : "withdrawn";
  await auditedChange(`policy.${command}`, "academic_policy_version", async (tx) => {
    if (command === "approve" && baseline) {
      const values = Object.fromEntries(VERSION_FIELDS.map((key) => [key, String(row.figures[key])]));
      await tx.insert(academicPolicies).values({ termId: term.id, ...values });
    }
    const [after] = await tx.update(academicPolicyVersions).set({
      status, version, decidedByUserId: actor.id, decidedAt: new Date(), decisionNote: note, decisionFingerprint: fingerprint,
    }).where(and(eq(academicPolicyVersions.id, versionId), eq(academicPolicyVersions.status, "proposed"))).returning();
    return { result: null, entityId: versionId, before: { status: row.status }, after,
      detail: { termId: term.id, effectiveFrom: row.effectiveFrom, baseline, note } };
  });
  refresh();
  if (command === "withdraw") return succeeded("Proposal withdrawn. The policy in force is unchanged.", { entityId: versionId });
  if (command === "reject") return succeeded("Proposal rejected. The policy in force is unchanged.", { entityId: versionId });
  const changed = policy.timeline ? changedFields(versionOn(policy.timeline, row.effectiveFrom).figures, row.figures).map((key) => SHORT_LABELS[key].toLowerCase()) : [];
  return succeeded(baseline
    ? "Baseline approved. Payments and marks now use the recorded policy."
    : `${versionLabel(version!)} approved from ${row.effectiveFrom}${changed.length ? ` (${changed.join(", ")})` : ""}.`, { entityId: versionId });
}
