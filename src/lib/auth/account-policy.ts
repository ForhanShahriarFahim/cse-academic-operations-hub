/**
 * AUTH-02 account rules that need no database: sign-in methods, lockout and
 * link lifetimes (decisions D-4 and D-5 in docs/specs/AUTH-02/spec.md).
 */

export const SIGN_IN_METHODS = ["password", "google"] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

export const MAX_FAILED_SIGN_INS = 5;
export const LOCK_MINUTES = 15;
export const LINK_LIFETIME_HOURS = { setup: 72, reset: 24 } as const;
export type LinkPurpose = keyof typeof LINK_LIFETIME_HOURS;

/** The one message for every refused password sign-in, whatever the reason. */
export const SIGN_IN_REFUSED = `Email or password not accepted. After ${MAX_FAILED_SIGN_INS} failed tries, wait ${LOCK_MINUTES} minutes.`;
/** The one message for every link that cannot be used, whatever the reason. */
export const LINK_REFUSED = "This link can no longer be used. Ask the portal administrator for a new one.";

export interface AccountMethods {
  status: string;
  passwordEnabled: boolean;
  googleEnabled: boolean;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isUsableStatus = (status: string) => status === "invited" || status === "active";

export function methodEnabled(account: AccountMethods, method: SignInMethod): boolean {
  return method === "password" ? account.passwordEnabled : account.googleEnabled;
}

/** Sessions made before AUTH-02 carry no method; they could only have come from Google. */
export function sessionMethod(stamped: string | null | undefined): SignInMethod | null {
  if (stamped == null) return "google";
  return (SIGN_IN_METHODS as readonly string[]).includes(stamped) ? stamped as SignInMethod : null;
}

/** A session stays valid only while its account is usable and its method is still enabled. */
export function sessionAllowed(account: AccountMethods, stamped: string | null | undefined): boolean {
  const method = sessionMethod(stamped);
  return method != null && isUsableStatus(account.status) && methodEnabled(account, method);
}

export const isLocked = (lockedUntil: Date | null | undefined, now: Date) => lockedUntil != null && lockedUntil > now;

export const lockEndsAt = (now: Date) => new Date(now.getTime() + LOCK_MINUTES * 60_000);

/** A same-site path to return to after sign-in; anything else returns home. */
export function safeReturnPath(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/";
}

export const linkExpiresAt =(purpose: LinkPurpose, now: Date) =>
  new Date(now.getTime() + LINK_LIFETIME_HOURS[purpose] * 3_600_000);
