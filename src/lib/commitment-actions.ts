"use server";

/**
 * OD-01A — cross-department commitment lifecycle (spec D-2–D-5). Every write runs
 * in the shared active-term context, checks `manage_external_commitments`, the
 * record's term and the revision the user opened, and audits atomically. A
 * refused change writes nothing and no audit event. Hard delete stays in
 * ./actions (BUG-27 guard).
 */
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { externalCommitments, teachers, workloadAllocations } from "@/db/schema";
import { db } from "@/db";
import { withActiveTermContext } from "./active-term";
import { auditedChange } from "./auth/audit";
import { guardAction } from "./auth/action-guard";
import { invalid, stale, succeeded, type ActionResult } from "./action-result";
import type { TermWriteContext } from "./term-context-value";
import { getActiveTerm } from "./data";
import { OUTSIDE_ACTIVE_TERM, isInActiveTerm } from "./term-scope";
import { lockRooms, roomAssignmentGuard } from "./room-transaction";
import { assertActiveRooms, retainAssignedRooms } from "./room-lifecycle-transaction";
import { assertMaintenanceClear } from "./room-maintenance-transaction";
import { readCoveredCommitmentIds } from "./commitment-link-evidence";
import {
  changedFields, completenessLevel, parseCommitmentInput, parseReason, planningFactsChanged, usesRoom, type CommitmentFacts,
} from "./commitment-records";

type Row = typeof externalCommitments.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const refresh = () => revalidatePath("/", "layout");
const CHANGED = "This commitment changed since you opened it. Reload to see the current version; your entries are kept.";
const MISSING = "This commitment no longer exists. Reload the register.";
const formOf = (formData: unknown) => (formData instanceof FormData ? formData : null);
const fieldsOf = (formData: FormData) => Object.fromEntries([...formData.keys()].map((key) => [key, formData.get(key)]));

/** Refusal raised inside the audited transaction: nothing is written and no audit event is stored. */
class Refused extends Error { constructor(readonly result: ActionResult) { super(result.message); } }
async function guarded(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    let done: ActionResult | null = null;
    const roomFailure = await roomAssignmentGuard(async () => { done = await work(); });
    return roomFailure ?? done!;
  } catch (error) {
    if (error instanceof Refused) return error.result;
    throw error;
  }
}

function revisionOf(formData: FormData): number | null {
  const raw = String(formData.get("revision") ?? "");
  return /^\d{1,9}$/.test(raw) && Number(raw) >= 1 ? Number(raw) : null;
}

async function lockedRow(tx: Tx, id: number, revision: number | null): Promise<Row> {
  const [row] = await tx.select().from(externalCommitments).where(eq(externalCommitments.id, id)).for("update");
  if (!row) throw new Refused(stale(MISSING, "missing"));
  if (revision == null || row.revision !== revision) throw new Refused(stale(CHANGED, "changed"));
  return row;
}

/** Inactive or missing teachers cannot take new work; an unchanged teacher on an edit is kept. */
async function assertTeacher(tx: Tx, teacherId: number | null) {
  if (teacherId == null) return;
  const [teacher] = await tx.select({ status: teachers.status, shortCode: teachers.shortCode }).from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  if (!teacher) throw new Refused(invalid("That teacher record no longer exists. Reload and choose again.", { teacherId: ["Choose the teacher again."] }));
  if (teacher.status === "inactive") throw new Refused(invalid(`${teacher.shortCode} is inactive. Reactivate on the teacher page before recording new work.`, { teacherId: ["This teacher is inactive."] }));
}

/** Lock, check and retain the room; maintenance applies to room-blocking uses only. */
async function assertRoom(tx: Tx, actor: Parameters<typeof retainAssignedRooms>[1], facts: Pick<CommitmentFacts, "kind" | "roomId" | "dayOfWeek" | "startMinutes" | "endMinutes" | "effectiveFrom" | "effectiveTo">, label: string, checkMaintenance: boolean) {
  if (facts.roomId == null) return;
  await lockRooms(tx, [facts.roomId]);
  await assertActiveRooms(tx, [facts.roomId]);
  if (checkMaintenance && usesRoom(facts.kind)) {
    const term = await getActiveTerm();
    await assertMaintenanceClear(tx, [facts.roomId], { termStart: term.startDate, termEnd: term.endDate, effectiveFrom: facts.effectiveFrom, effectiveTo: facts.effectiveTo }, facts);
  }
  await retainAssignedRooms(tx, actor, [facts.roomId], label);
}

const stored = (facts: CommitmentFacts) => ({
  kind: facts.kind, counterpartDepartment: facts.counterpartDepartment, teacherId: facts.teacherId, roomId: facts.roomId,
  dayOfWeek: facts.dayOfWeek, startMinutes: facts.startMinutes, endMinutes: facts.endMinutes, courseLabel: facts.courseLabel,
  audienceLabel: facts.audienceLabel, credits: facts.credits, notes: facts.notes, completenessLevel: completenessLevel(facts),
  effectiveFrom: facts.effectiveFrom, effectiveTo: facts.effectiveTo,
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createExternalAction(formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withActiveTermContext(() => createInTerm(formData), context ?? formData);
}
async function createInTerm(raw: FormData): Promise<ActionResult> {
  const denied = await guardAction("manage_external_commitments");
  if (denied) return denied;
  const formData = formOf(raw);
  if (!formData) return invalid("Submit a valid commitment form.");
  const term = await getActiveTerm();
  const parsed = parseCommitmentInput(fieldsOf(formData), { termStart: term.startDate, termEnd: term.endDate });
  if (!parsed.ok) return invalid(parsed.message, parsed.errors);
  const facts = parsed.value;
  return guarded(() => auditedChange("external.create", "external_commitment", async (tx, actor) => {
    await assertTeacher(tx, facts.teacherId);
    if (facts.roomId != null) { await lockRooms(tx, [facts.roomId]); await assertActiveRooms(tx, [facts.roomId]); if (usesRoom(facts.kind)) await assertMaintenanceClear(tx, [facts.roomId], { termStart: term.startDate, termEnd: term.endDate, effectiveFrom: facts.effectiveFrom, effectiveTo: facts.effectiveTo }, facts); }
    const [row] = await tx.insert(externalCommitments).values({
      termId: term.id, ...stored(facts), verificationStatus: "pending", source: "Manual entry", updatedAt: new Date(),
    }).returning();
    if (facts.roomId != null) await retainAssignedRooms(tx, actor, [facts.roomId], `OD #${row.id}`);
    refresh();
    return { result: succeeded(`Commitment recorded as Pending (completeness ${row.completenessLevel}).`, { entityId: row.id }), entityId: row.id, after: row };
  }));
}

// ---------------------------------------------------------------------------
// Edit (and Resolve note, which is an edit away from an unresolved note)
// ---------------------------------------------------------------------------

export async function editExternalAction(id: number, formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withActiveTermContext(() => editInTerm(id, formData), context ?? formData);
}
async function editInTerm(id: number, raw: FormData): Promise<ActionResult> {
  const denied = await guardAction("manage_external_commitments");
  if (denied) return denied;
  const formData = formOf(raw);
  if (!Number.isSafeInteger(id) || id < 1 || !formData) return invalid("Submit a valid commitment form.");
  if (!await isInActiveTerm("external_commitment", id)) return { ...OUTSIDE_ACTIVE_TERM };
  const term = await getActiveTerm();
  const parsed = parseCommitmentInput(fieldsOf(formData), { termStart: term.startDate, termEnd: term.endDate });
  if (!parsed.ok) return invalid(parsed.message, parsed.errors);
  const revision = revisionOf(formData);
  const next = parsed.value;
  let resolved = false;
  const audited = await guarded(async () => {
    // The audit name depends on the stored kind, so read it under the lock first.
    const [current] = await db.select({ kind: externalCommitments.kind }).from(externalCommitments).where(eq(externalCommitments.id, id)).limit(1);
    resolved = current?.kind === "unresolved_note" && next.kind !== "unresolved_note";
    return auditedChange(resolved ? "external.resolve" : "external.edit", "external_commitment", async (tx, actor) => {
      const before = await lockedRow(tx, id, revision);
      if (before.lifecycleStatus === "archived") throw new Refused(invalid("This commitment is archived. Reactivate it before editing."));
      if ((before.kind === "unresolved_note" && next.kind !== "unresolved_note") !== resolved) throw new Refused(stale(CHANGED, "changed"));
      const facts = { ...next };
      if (resolved && before.notes && !(facts.notes ?? "").includes(before.notes)) {
        facts.notes = [facts.notes, `Original note: ${before.notes}`].filter(Boolean).join("\n").slice(0, 1000);
      }
      const changed = changedFields(before, facts);
      if (!changed.length) throw new Refused(invalid("Nothing changed. Edit a value or cancel."));
      const planningChanged = planningFactsChanged(before, facts);
      if (facts.teacherId !== before.teacherId) await assertTeacher(tx, facts.teacherId);
      await assertRoom(tx, actor, facts, `OD #${id}`, planningChanged);
      if (before.roomId != null && before.roomId !== facts.roomId) await lockRooms(tx, [before.roomId]);
      const returned = planningChanged && before.verificationStatus === "verified";
      const [after] = await tx.update(externalCommitments).set({
        ...stored(facts), ...(returned ? { verificationStatus: "pending" } : {}), revision: before.revision + 1, updatedAt: new Date(),
      }).where(eq(externalCommitments.id, id)).returning();
      refresh();
      const message = resolved
        ? `Note resolved into a structured commitment (completeness ${after.completenessLevel}). It is Pending until verified.`
        : returned ? "Commitment updated. Planning facts changed, so it returned to Pending." : "Commitment updated.";
      return { result: succeeded(message, { entityId: id }), entityId: id, before, after, detail: { changed, returnedToPending: returned } };
    });
  });
  return audited;
}

// ---------------------------------------------------------------------------
// Verify, return to pending, archive and reactivate
// ---------------------------------------------------------------------------

type Command = "verify" | "return" | "archive" | "reactivate";
const COMMAND_EVENTS: Record<Command, string> = { verify: "external.verify", return: "external.return", archive: "external.archive", reactivate: "external.reactivate" };

async function transition(command: Command, id: number, raw: FormData): Promise<ActionResult> {
  const denied = await guardAction("manage_external_commitments");
  if (denied) return denied;
  const formData = formOf(raw);
  if (!Number.isSafeInteger(id) || id < 1 || !formData) return invalid("Submit a valid request.");
  if (!await isInActiveTerm("external_commitment", id)) return { ...OUTSIDE_ACTIVE_TERM };
  const field = command === "verify" ? "note" : "reason";
  const text = parseReason(formData.get(field));
  if (!text) return invalid(command === "verify" ? "Say how this was confirmed (1–300 characters)." : "Enter a reason of 1–300 characters.", { [field]: ["Required, 1–300 characters."] });
  const revision = revisionOf(formData);
  return guarded(() => auditedChange(COMMAND_EVENTS[command], "external_commitment", async (tx, actor) => {
    const before = await lockedRow(tx, id, revision);
    const now = new Date();
    let set: Partial<Row>, message: string, detail: Record<string, unknown> = { [field]: text };
    if (command === "verify") {
      if (before.lifecycleStatus !== "active" || before.verificationStatus === "verified") throw new Refused(stale(CHANGED, "changed"));
      if (before.kind === "unresolved_note") throw new Refused(invalid("An unresolved note cannot be verified. Resolve it into a structured commitment first."));
      if (before.carriedFromTermId !== null) {
        await assertTeacher(tx, before.teacherId);
        await assertRoom(tx, actor, { ...before, kind: before.kind as CommitmentFacts["kind"] }, `OD #${id}`, true);
      }
      set = { verificationStatus: "verified", lastVerifiedAt: now, verificationNote: text };
      message = "Commitment verified.";
    } else if (command === "return") {
      if (before.lifecycleStatus !== "active" || before.verificationStatus !== "verified") throw new Refused(stale(CHANGED, "changed"));
      set = { verificationStatus: "pending" };
      message = "Commitment returned to Pending.";
    } else if (command === "archive") {
      if (before.lifecycleStatus !== "active") throw new Refused(stale(CHANGED, "changed"));
      if (before.roomId != null) await lockRooms(tx, [before.roomId]);
      const allocations = await tx.select({ shortCode: teachers.shortCode, units: workloadAllocations.units }).from(workloadAllocations)
        .innerJoin(teachers, eq(teachers.id, workloadAllocations.teacherId)).where(eq(workloadAllocations.externalCommitmentId, id)).orderBy(asc(teachers.shortCode));
      detail = { ...detail, workloadUnchanged: allocations };
      set = { lifecycleStatus: "archived", archivedAt: now, archiveReason: text };
      message = allocations.length
        ? `Commitment archived. Workload still counts it: ${allocations.map((a) => `${a.shortCode} ${a.units} units`).join(", ")}.`
        : "Commitment archived. It no longer affects planning.";
    } else {
      if (before.lifecycleStatus !== "archived") throw new Refused(stale(CHANGED, "changed"));
      await assertTeacher(tx, before.teacherId);
      await assertRoom(tx, actor, { ...before, kind: before.kind as CommitmentFacts["kind"] }, `OD #${id}`, true);
      set = { lifecycleStatus: "active", archivedAt: null, archiveReason: null, verificationStatus: "pending" };
      message = "Commitment reactivated as Pending.";
    }
    const [after] = await tx.update(externalCommitments).set({ ...set, revision: before.revision + 1, updatedAt: now }).where(eq(externalCommitments.id, id)).returning();
    refresh();
    return { result: succeeded(message, { entityId: id }), entityId: id, before, after, detail };
  }));
}

export async function verifyExternalAction(id: number, formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withActiveTermContext(() => transition("verify", id, formData), context ?? formData);
}
export async function returnExternalAction(id: number, formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withActiveTermContext(() => transition("return", id, formData), context ?? formData);
}
export async function archiveExternalAction(id: number, formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withActiveTermContext(() => transition("archive", id, formData), context ?? formData);
}
export async function reactivateExternalAction(id: number, formData: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withActiveTermContext(() => transition("reactivate", id, formData), context ?? formData);
}

export async function setExternalLinkAction(id: number, raw: FormData, context?: TermWriteContext): Promise<ActionResult> {
  return withActiveTermContext(() => setLinkInTerm(id, raw), context ?? raw, "exclusive");
}

async function setLinkInTerm(id: number, raw: FormData): Promise<ActionResult> {
  const denied = await guardAction("manage_external_commitments");
  if (denied) return denied;
  if (!Number.isSafeInteger(id) || id < 1 || !(raw instanceof FormData)) return invalid("Submit a valid link request.");
  if (!await isInActiveTerm("external_commitment", id)) return { ...OUTSIDE_ACTIVE_TERM };
  const reason = parseReason(raw.get("reason"));
  const value = raw.get("groupId");
  if (!reason) return invalid("Enter a reason of 1–300 characters.", { reason: ["Enter a reason of 1–300 characters."] });
  if (typeof value !== "string" || (value !== "" && !/^[1-9]\d{0,8}$/.test(value))) return invalid("Choose an eligible teaching group.");
  const groupId = value === "" ? null : Number(value);

  return guarded(() => auditedChange(groupId === null ? "external.unlink" : "external.link", "external_commitment", async (tx) => {
    const before = await lockedRow(tx, id, revisionOf(raw));
    if (groupId === null) {
      if (before.linkedTeachingGroupId === null) throw new Refused(stale(CHANGED, "changed"));
    } else {
      if (before.lifecycleStatus !== "active" || before.linkedTeachingGroupId !== null) throw new Refused(stale(CHANGED, "changed"));
      const [allocation] = await tx.select({ id: workloadAllocations.id }).from(workloadAllocations).where(eq(workloadAllocations.externalCommitmentId, id)).limit(1);
      if (allocation) throw new Refused(invalid("This commitment counts toward workload. Resolve that allocation before linking."));
      const term = await getActiveTerm();
      const covered = await readCoveredCommitmentIds(tx, [{ ...before, linkedTeachingGroupId: groupId, termStart: term.startDate, termEnd: term.endDate }]);
      if (!covered.has(id)) throw new Refused(stale("That teaching group no longer covers this commitment. Reload the current matches and review again."));
    }
    const [after] = await tx.update(externalCommitments).set({ linkedTeachingGroupId: groupId, revision: before.revision + 1, updatedAt: new Date() }).where(eq(externalCommitments.id, id)).returning();
    refresh();
    return { result: succeeded(groupId === null ? "Teaching group link removed." : "Commitment linked to the formal teaching group.", { entityId: id }), entityId: id, before, after,
      detail: { reason, changed: ["linkedTeachingGroupId"], groupId: groupId ?? before.linkedTeachingGroupId } };
  }));
}
