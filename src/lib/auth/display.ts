/** AUTH-02 display helpers: instants in Asia/Dhaka and plain device names. Safe in client components. */

const ZONE = "Asia/Dhaka";
const dayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: ZONE });
const clock = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONE });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: ZONE });
const fullDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: ZONE });

const asDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

/** "today, 9:12 am", "yesterday, 7:48 pm", "30 September, 7:48 pm" or "30 September 2025, 7:48 pm". */
export function fmtInstant(value: Date | string, now: Date = new Date()): string {
  const at = asDate(value);
  const time = clock.format(at).replace(/\s/g, " ");
  const day = dayKey.format(at);
  if (day === dayKey.format(now)) return `today, ${time}`;
  if (day === dayKey.format(new Date(now.getTime() - 86_400_000))) return `yesterday, ${time}`;
  const sameYear = day.slice(0, 4) === dayKey.format(now).slice(0, 4);
  return `${sameYear ? dayMonth.format(at) : fullDay.format(at)}, ${time}`;
}

/** "5 October 2026" in Asia/Dhaka. */
export const fmtDay = (value: Date | string) => fullDay.format(asDate(value));

/** The date a role's end falls on, given its exclusive end instant (the following midnight). */
export const fmtLastDay = (activeTo: Date | string) => fullDay.format(new Date(asDate(activeTo).getTime() - 1));

/** "Chrome on Windows", from a user-agent string; "Unknown device" when it says nothing useful. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  const system = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
}

export const isPhone = (userAgent: string | null | undefined) => /Android|iPhone|Mobile/.test(userAgent ?? "");

const ROLE_WORDS: Record<string, string> = {
  system_administrator: "System administrator", academic_administrator: "Academic administrator", routine_coordinator: "Routine coordinator",
  department_approver: "Department approver", teacher: "Teacher", accounts_officer: "Accounts officer", read_only_viewer: "Read-only viewer",
};

/** One account audit event as a short sentence, e.g. "You issued a reset link". Secrets are never in audit rows. */
export function activityText(
  event: { action: string; actorName: string | null; actorUserId: number | null; detail: unknown; before: unknown; after: unknown },
  viewerId: number,
  subjectId: number,
  subjectName: string,
): string {
  const who = event.actorUserId === viewerId ? "You" : event.actorUserId === subjectId ? subjectName : event.actorName ?? "The system";
  const after = (event.after ?? {}) as Record<string, unknown>;
  const before = (event.before ?? {}) as Record<string, unknown>;
  const role = ROLE_WORDS[String(after.role ?? before.role ?? "")] ?? "a role";
  switch (event.action) {
    case "user.create": return `${who} created the account`;
    case "user.invite": return `${who} invited this account`;
    case "user.bootstrap_admin": return "The first-administrator command set up this account";
    case "user.activate": return `${subjectName} signed in for the first time`;
    case "user.details": return `${who} edited the account details`;
    case "user.methods": return `${who} changed the sign-in methods`;
    case "user.link.issue": return `${who} issued a ${after.purpose === "reset" ? "reset" : "setup"} link`;
    case "user.link.revoke": return `${who} revoked the open link`;
    case "user.password.set": return `${subjectName} set a password with the setup link`;
    case "user.password.reset": return `${subjectName} reset the password with a link`;
    case "user.password.change": return `${subjectName} changed the password`;
    case "user.lockout": return "Password sign-in locked after 5 failed tries";
    case "user.lockout.clear": return `${who} cleared the sign-in lock`;
    case "user.sessions.revoke": return `${who} signed ${event.actorUserId === subjectId ? "out other devices" : `${subjectName} out everywhere`}`;
    case "user.status": return `${who} ${after.status === "suspended" ? "suspended the account" : "reactivated the account"}`;
    case "user.role.grant": return `${who} gave the ${role} role`;
    case "user.role.schedule": return `${who} scheduled the ${role} role`;
    case "user.role.end": return `${who} ended the ${role} role`;
    case "user.role.cancel": return `${who} cancelled the scheduled ${role} role`;
    case "user.role.revoke": return `${who} removed the ${role} role`;
    case "user.recovery_link": return `The operator command issued a ${after.purpose === "reset" ? "reset" : "setup"} link`;
    default: return `${who}: ${event.action}`;
  }
}
