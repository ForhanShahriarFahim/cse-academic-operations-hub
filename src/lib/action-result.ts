/**
 * Shared server-action result contract (SAFE-01 / AC-06).
 *
 * Compatibility: `ok`, `message` and `issues` keep their existing meaning, so
 * current forms continue to work unchanged. New consumers may read the optional
 * structured `outcome`; results created before this contract have none and are
 * classified by `outcomeOf`. Results are plain serializable data, as Server
 * Functions return expected errors as values rather than throwing.
 *
 * Invariants (enforced by the builders below):
 * - `ok` is true only for a `success` outcome. A partial import is `ok: false`
 *   so legacy consumers never present it as complete.
 * - `conflict` carries the blocking issues, and its counts match them.
 * - `partial` counts satisfy applied + rejected rows = total, with rows applied
 *   and rejected both reported.
 * This contract defines outcomes; it does not add stale locking or change CSV
 * or toast behaviour. Consumers adopt it in their own issues.
 */
import type { Issue } from "./conflicts";

export type ResultIssue = Pick<Issue, "severity" | "title" | "detail">;

export type OutcomeKind = "success" | "validation" | "conflict" | "permission" | "stale" | "partial";

export type ActionOutcome =
  | { kind: "success"; entityId?: number | null }
  | { kind: "validation"; fieldErrors: Record<string, string[]> }
  | { kind: "conflict"; blockers: number; warnings: number }
  | { kind: "permission"; reason: "unauthenticated" | "forbidden" }
  | { kind: "stale"; reason: "changed" | "not_active_term" | "missing" }
  | { kind: "partial"; total: number; applied: number; rejected: Array<{ row: number; message: string }> };

export interface ActionResult {
  ok: boolean;
  message: string;
  issues?: ResultIssue[];
  outcome?: ActionOutcome;
}

const issueOnly = (issue: ResultIssue): ResultIssue => ({ severity: issue.severity, title: issue.title, detail: issue.detail });

export function succeeded(message: string, options: { entityId?: number | null; issues?: ResultIssue[] } = {}): ActionResult {
  return {
    ok: true,
    message,
    ...(options.issues?.length ? { issues: options.issues.map(issueOnly) } : {}),
    outcome: { kind: "success", ...(options.entityId !== undefined ? { entityId: options.entityId } : {}) },
  };
}

export function invalid(message: string, fieldErrors: Record<string, string[]> = {}): ActionResult {
  return { ok: false, message, outcome: { kind: "validation", fieldErrors } };
}

export function conflicted(message: string, issues: ResultIssue[]): ActionResult {
  const blockers = issues.filter((issue) => issue.severity === "blocker").length;
  if (blockers === 0) throw new Error("A conflict result needs at least one blocking issue.");
  return {
    ok: false,
    message,
    issues: issues.map(issueOnly),
    outcome: { kind: "conflict", blockers, warnings: issues.length - blockers },
  };
}

export function denied(message: string, reason: "unauthenticated" | "forbidden"): ActionResult & { ok: false } {
  return { ok: false, message, outcome: { kind: "permission", reason } };
}

export function stale(message: string, reason: "changed" | "not_active_term" | "missing" = "changed"): ActionResult & { ok: false } {
  return { ok: false, message, outcome: { kind: "stale", reason } };
}

export function partial(message: string, counts: { total: number; applied: number; rejected: Array<{ row: number; message: string }> }): ActionResult {
  const { total, applied, rejected } = counts;
  if (![total, applied].every((value) => Number.isInteger(value) && value >= 0) || applied + rejected.length !== total) {
    throw new Error("Partial result counts must satisfy applied + rejected rows = total.");
  }
  if (applied === 0 || rejected.length === 0) throw new Error("A partial result needs both applied and rejected rows.");
  return { ok: false, message, outcome: { kind: "partial", total, applied, rejected: rejected.map((row) => ({ ...row })) } };
}

/** The outcome category of any result, including legacy results without `outcome`. */
export function outcomeOf(result: ActionResult): OutcomeKind {
  if (result.outcome) return result.outcome.kind;
  if (result.ok) return "success";
  return result.issues?.some((issue) => issue.severity === "blocker") ? "conflict" : "validation";
}
