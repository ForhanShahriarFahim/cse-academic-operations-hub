"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SIGN_IN_REFUSED, safeReturnPath } from "./account-policy";
import { attemptPasswordSignIn } from "./password-sign-in";
import { authConfigured } from "./provider";
import { clientAddress, requestThrottle } from "./throttle";

export interface SignInState { message: string | null; email: string }

/** The login form's password sign-in (AUTH-02). Every refusal shows the same message. */
export async function signInWithPasswordAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!authConfigured) return { message: "Sign-in is not set up on this server yet.", email };
  if (!email || !password) return { message: "Enter your email and password.", email };
  const requestHeaders = await headers();
  if (!requestThrottle.allow("sign-in", clientAddress(requestHeaders))) return { message: SIGN_IN_REFUSED, email };
  const outcome = await attemptPasswordSignIn(email, password, requestHeaders);
  if (!outcome.ok) return { message: SIGN_IN_REFUSED, email };
  redirect(safeReturnPath(formData.get("next")));
}
