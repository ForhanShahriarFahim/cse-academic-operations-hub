/**
 * ATT-03A attendance session lifecycle. Database-free: the transition table,
 * who may run each command, and reason validation. Server actions call
 * `decideSession` after authorization and before any write.
 */

export const SESSION_STATES = ["draft", "submitted", "reopened", "locked", "voided"] as const;
export type SessionState = typeof SESSION_STATES[number];
export const STATE_LABELS: Record<SessionState, string> = {
  draft: "Draft", submitted: "Submitted", reopened: "Reopened", locked: "Locked", voided: "Voided",
};
export const stateLabel = (state: string) => STATE_LABELS[state as SessionState] ?? state;
export const isSessionState = (value: unknown): value is SessionState => SESSION_STATES.includes(value as SessionState);

export const SESSION_COMMANDS = ["save", "submit", "reopen", "lock", "void", "restore", "delete"] as const;
export type SessionCommand = typeof SESSION_COMMANDS[number];
export const isSessionCommand = (value: unknown): value is SessionCommand => SESSION_COMMANDS.includes(value as SessionCommand);

/** taker: the group's `take_attendance` decision; reviewer: `review_attendance` in the group's department. */
export interface SessionRoles { taker: boolean; reviewer: boolean }
type Who = "taker" | "reviewer" | "either";
type Rule = { to: SessionState | null; who: Who };

/** The approved D-2/D-3 table. A missing entry means the command is not allowed from that state. */
const TRANSITIONS: Record<SessionCommand, Partial<Record<SessionState, Rule>>> = {
  save: { draft: { to: "draft", who: "taker" }, reopened: { to: "reopened", who: "either" } },
  submit: { draft: { to: "submitted", who: "taker" }, reopened: { to: "submitted", who: "either" } },
  delete: { draft: { to: null, who: "taker" } },
  reopen: { submitted: { to: "reopened", who: "either" }, locked: { to: "reopened", who: "reviewer" } },
  lock: { submitted: { to: "locked", who: "reviewer" } },
  void: { submitted: { to: "voided", who: "either" }, reopened: { to: "voided", who: "either" }, locked: { to: "voided", who: "reviewer" } },
  restore: { voided: { to: "reopened", who: "reviewer" } },
};

export const REASON_REQUIRED: Record<SessionCommand, "required" | "optional" | "none"> = {
  save: "none", submit: "none", delete: "none", reopen: "required", lock: "optional", void: "required", restore: "required",
};

const permits = (who: Who, roles: SessionRoles) =>
  who === "taker" ? roles.taker : who === "reviewer" ? roles.reviewer : roles.taker || roles.reviewer;

export type Decision = { ok: true; to: SessionState | null } | { ok: false; reason: "state" | "role" };

export function decideSession(command: SessionCommand, state: string, roles: SessionRoles): Decision {
  const rule = isSessionState(state) ? TRANSITIONS[command][state] : undefined;
  if (!rule) return { ok: false, reason: "state" };
  return permits(rule.who, roles) ? { ok: true, to: rule.to } : { ok: false, reason: "role" };
}

/** Commands to offer for one session, in display order. Hidden commands are still refused by the server. */
export function availableCommands(state: string, roles: SessionRoles): SessionCommand[] {
  return SESSION_COMMANDS.filter((command) => decideSession(command, state, roles).ok);
}

export const isEditable = (state: string) => state === "draft" || state === "reopened";
export const countsInSummary = (state: string) => state !== "voided";
export const isUnsubmitted = (state: string) => state === "draft" || state === "reopened";

export const REASON_MIN = 3, REASON_MAX = 300;
export const REASON_HINT = `${REASON_MIN}–${REASON_MAX} characters. Describe the correction; do not include marks, grades or contact details.`;

/** Trimmed plain text, or null when allowed to be empty; undefined means invalid. */
export function parseReason(value: unknown, requirement: "required" | "optional" | "none"): string | null | undefined {
  if (requirement === "none") return null;
  if (value != null && typeof value !== "string") return undefined;
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return requirement === "optional" ? null : undefined;
  if (/[\u0000-\u001f\u007f]/.test(text)) return undefined;
  if (text.length > REASON_MAX) return undefined;
  if (requirement === "required" && text.length < REASON_MIN) return undefined;
  return text;
}

export const SESSION_ACTION_LABELS: Record<string, string> = {
  "attendance.session.create": "Session created",
  "attendance.save": "Marks saved",
  "attendance.submit": "Submitted",
  "attendance.reopen": "Reopened for correction",
  "attendance.lock": "Locked",
  "attendance.void": "Voided",
  "attendance.restore": "Restored",
  "attendance.session.delete": "Draft deleted",
};
export const sessionActionLabel = (action: string, from?: unknown) =>
  action === "attendance.submit" && from === "reopened" ? "Resubmitted" : SESSION_ACTION_LABELS[action] ?? action;

export const COMMAND_MESSAGES: Record<SessionCommand, string> = {
  save: "Attendance saved.",
  submit: "Roll-call submitted. It is read-only until reopened.",
  reopen: "Session reopened for correction. Submit it again when the correction is complete.",
  lock: "Session locked. Only an attendance reviewer can reopen or void it.",
  void: "Session voided. It is kept but no longer counts.",
  restore: "Session restored as reopened. Submit it again to finish.",
  delete: "Draft session removed.",
};

export const STALE_SESSION_MESSAGE = "This session changed. Reload to see its current state.";

export interface StatusChange { studentId: number; studentCode: string; from: string; to: string }
/** Changed students only, in roll order; unchanged values are omitted. */
export function statusChanges(existing: ReadonlyArray<{ studentId: number; studentCode: string; status: string }>, values: ReadonlyArray<{ studentId: number; status: string }>): StatusChange[] {
  const next = new Map(values.map((value) => [value.studentId, value.status]));
  return existing.flatMap((row) => {
    const to = next.get(row.studentId);
    return to !== undefined && to !== row.status ? [{ studentId: row.studentId, studentCode: row.studentCode, from: row.status, to }] : [];
  });
}
