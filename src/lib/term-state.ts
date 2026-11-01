/** Shared safe messages; no database, auth or framework dependency. */
export type TermProblem = "none" | "ambiguous";
export const TERM_ACTION_MESSAGE = "Academic term configuration is unavailable. No changes were saved. Contact the portal administrator.";
export const PUBLIC_TERM_MESSAGE = "Routine temporarily unavailable.";

export class ActiveTermUnavailable extends Error {
  constructor(readonly problem: TermProblem) {
    super(problem === "none" ? "No academic term is active. Contact the portal administrator." : "More than one academic term is active. Contact the portal administrator.");
    this.name = "ActiveTermUnavailable";
  }
}

export type ActiveTermState<T> = { kind: "none" } | { kind: "one"; term: T } | { kind: "ambiguous" };
export function classifyActiveTerms<T>(rows: readonly T[]): ActiveTermState<T> {
  return rows.length === 0 ? { kind: "none" } : rows.length === 1 ? { kind: "one", term: rows[0] } : { kind: "ambiguous" };
}
