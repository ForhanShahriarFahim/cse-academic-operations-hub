import { COMMON_PASSWORDS } from "./common-passwords";

/** AUTH-02 password rules (decision D-4): length, not common, not the email name. No composition rules. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export type PasswordRule = "length" | "common" | "email";

export interface PasswordCheck {
  rule: PasswordRule;
  met: boolean;
  /** The rule as shown before typing. */
  label: string;
}

/** Length in characters as a person counts them (code points), not UTF-16 units. */
export const passwordLength = (password: string) => [...password].length;

/** The part of the email before "@", lower case; shown in the rule and refused inside a password. */
export function emailName(email: string): string {
  return email.trim().toLowerCase().split("@")[0] ?? "";
}

export function passwordChecks(password: string, email: string): PasswordCheck[] {
  const length = passwordLength(password);
  const name = emailName(email);
  const folded = password.toLowerCase().replace(/\s+/g, "");
  return [
    { rule: "length", met: length >= MIN_PASSWORD_LENGTH && length <= MAX_PASSWORD_LENGTH, label: `At least ${MIN_PASSWORD_LENGTH} characters. Spaces are fine.` },
    { rule: "common", met: folded.length > 0 && !COMMON_PASSWORDS.has(folded), label: "Not a commonly used password" },
    // Very short email names (under 4 characters) would refuse too many ordinary words.
    { rule: "email", met: name.length < 4 || !password.toLowerCase().includes(name), label: `Does not contain “${name}”` },
  ];
}

/** The one message shown at the field for the first rule a password breaks, or null when it passes. */
export function passwordProblem(password: string, email: string): string | null {
  const failed = passwordChecks(password, email).find((check) => !check.met);
  if (!failed) return null;
  const length = passwordLength(password);
  if (failed.rule === "length") {
    return length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters. This one has ${length}.`
      : `Use at most ${MAX_PASSWORD_LENGTH} characters. This one has ${length}.`;
  }
  if (failed.rule === "common") return "This password is too common. Choose a less predictable one; a phrase of several words works well.";
  return `Do not include “${emailName(email)}” in your password.`;
}
