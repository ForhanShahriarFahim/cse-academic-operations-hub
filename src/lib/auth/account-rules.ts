import type { Role } from "./policy";

/**
 * AUTH-02 administration safeguards that need no database. The last-administrator
 * count itself is taken inside the change's transaction (admin-guard.ts); these
 * functions decide what that count means.
 */

export type AccountChange =
  | { kind: "suspend" }
  | { kind: "end_role"; role: Role }
  | { kind: "set_methods"; passwordEnabled: boolean; googleEnabled: boolean; current: { passwordEnabled: boolean; googleEnabled: boolean } }
  | { kind: "unlink_teacher"; holdsTeacherRole: boolean };

export const KEEP_ONE_METHOD = "Keep at least one sign-in method on. To stop all access, suspend the account instead.";

/** Why the actor may not make this change to their own account, or null. */
export function selfChangeProblem(actorId: number, targetId: number, change: AccountChange): string | null {
  if (actorId !== targetId) return null;
  if (change.kind === "suspend") return "You cannot suspend your own account.";
  if (change.kind === "end_role" && change.role === "system_administrator") return "You cannot remove your own system administrator role.";
  // Turning off a method could end the very session making the change; another administrator can do it.
  if (change.kind === "set_methods"
    && ((change.current.passwordEnabled && !change.passwordEnabled) || (change.current.googleEnabled && !change.googleEnabled))) {
    return "You cannot turn off your own sign-in methods. Ask another system administrator.";
  }
  return null;
}

/** Problems with a change regardless of who makes it, or null. */
export function changeProblem(change: AccountChange): string | null {
  if (change.kind === "set_methods" && !change.passwordEnabled && !change.googleEnabled) return KEEP_ONE_METHOD;
  if (change.kind === "unlink_teacher" && change.holdsTeacherRole) {
    return "This account has the Teacher role, which needs a linked teacher record. End the Teacher role first.";
  }
  return null;
}

/** Whether the change would leave no active system administrator. */
export function removesLastAdministrator(targetId: number, activeAdministratorIds: ReadonlySet<number>, change: AccountChange): boolean {
  const removesAdmin = change.kind === "suspend" || (change.kind === "end_role" && change.role === "system_administrator");
  return removesAdmin && activeAdministratorIds.has(targetId) && activeAdministratorIds.size <= 1;
}

export function lastAdministratorMessage(displayName: string): string {
  return `${displayName} is the only active system administrator. Add another system administrator before suspending ${displayName} or removing the role.`;
}

export function teacherRoleProblem(role: Role, hasTeacherLink: boolean): string | null {
  return role === "teacher" && !hasTeacherLink ? "The Teacher role needs a linked teacher record. Link one in the account details first." : null;
}

const DHAKA_OFFSET = "+06:00"; // Asia/Dhaka has no daylight saving
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in Asia/Dhaka as YYYY-MM-DD. */
export function dhakaToday(now: Date): string {
  return new Date(now.getTime() + 6 * 3_600_000).toISOString().slice(0, 10);
}

const dhakaMidnight = (ymd: string) => new Date(`${ymd}T00:00:00${DHAKA_OFFSET}`);

/**
 * A role's start and end from form dates (days in Asia/Dhaka). A start of today
 * takes effect now; a later start at that day's midnight. The end date is the
 * last day the role applies, so it ends at the following midnight.
 */
export function roleWindow(start: string, end: string, now: Date):
  { ok: true; activeFrom: Date; activeTo: Date | null } | { ok: false; field: "activeFrom" | "activeTo"; message: string } {
  const today = dhakaToday(now);
  const startDay = start || today;
  if (!YMD.test(startDay) || Number.isNaN(dhakaMidnight(startDay).getTime())) return { ok: false, field: "activeFrom", message: "Enter a valid start date." };
  if (startDay < today) return { ok: false, field: "activeFrom", message: "A role cannot start in the past. Use today or a later date." };
  if (end && (!YMD.test(end) || Number.isNaN(dhakaMidnight(end).getTime()))) return { ok: false, field: "activeTo", message: "Enter a valid end date, or leave it empty." };
  if (end && end < startDay) return { ok: false, field: "activeTo", message: "The end date must be on or after the start date." };
  const activeFrom = startDay === today ? now : dhakaMidnight(startDay);
  const activeTo = end ? new Date(dhakaMidnight(end).getTime() + 86_400_000) : null;
  return { ok: true, activeFrom, activeTo };
}
