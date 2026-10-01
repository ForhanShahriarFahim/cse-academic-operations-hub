import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { authAccount, authSession, authUser, authVerification, portalUsers } from "@/db/schema";
import { isUsableStatus, normalizeEmail } from "./account-policy";

/** Sign-in of any kind needs a long secret and a base URL (AUTH-02 AC-06: password sign-in works without Google). */
export const authConfigured = Boolean(
  process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length >= 32 && process.env.BETTER_AUTH_URL,
);

export const googleAuthConfigured = authConfigured && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Better Auth paths a session may be created from, and the method each one means. */
function methodForPath(path: string | undefined): "password" | "google" | null {
  if (path === "/sign-in/email") return "password";
  // The OAuth callback reports its route template; Google is the only social provider configured.
  if (path === "/callback/:id" || path === "/callback/google") return "google";
  return null;
}

// Even a misconfigured deployment fails closed: without a secret and URL no
// actor is ever resolved, and no internal route is allowed anonymously.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "unconfigured-local-auth-secret-do-not-use-for-login",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
  }),
  // The portal sets and checks passwords through its own server actions
  // (src/lib/auth/sign-in.ts, account-actions.ts), so lockout, throttling and
  // audit always apply. The library's own HTTP routes for them stay closed.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  disabledPaths: [
    "/sign-in/email", "/sign-up/email", "/request-password-reset", "/reset-password", "/reset-password/:token",
    "/change-password", "/set-password", "/update-user", "/change-email", "/delete-user", "/link-social", "/unlink-account",
  ],
  socialProviders: googleAuthConfigured ? {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      requireEmailVerification: true,
      prompt: "select_account",
    },
  } : {},
  account: {
    // Google may join an account whose password was set first (its email is an
    // administrator-entered identifier, never mailbox-verified). Google must
    // still report the address as verified, and validateUserInfo below admits
    // only invited, usable accounts with Google enabled. Reviewed in AUTH-02 T-10.
    accountLinking: { enabled: true, requireLocalEmailVerified: false },
  },
  user: {
    validateUserInfo: async ({ user, source }) => {
      if (source.method !== "oauth" || source.oauth?.providerId !== "google") return { error: "provider_not_allowed" };
      const email = user.email ? normalizeEmail(user.email) : "";
      if (!email) return { error: "email_required" };
      const [account] = await db.select({ status: portalUsers.status, googleEnabled: portalUsers.googleEnabled })
        .from(portalUsers).where(eq(sql`lower(${portalUsers.email})`, email)).limit(1);
      if (!account || !isUsableStatus(account.status)) return { error: "account_not_invited" };
      if (!account.googleEnabled) return { error: "method_not_allowed" };
    },
  },
  session: {
    cookieCache: { enabled: false },
    additionalFields: { signInMethod: { type: "string", required: false, input: false } },
  },
  databaseHooks: {
    session: {
      create: {
        // Every session records how it was made; getOptionalActor refuses it once that method is turned off.
        before: async (session, context) => {
          const signInMethod = methodForPath(context?.path);
          if (!signInMethod) return false;
          return { data: { ...session, signInMethod } };
        },
      },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "memory",
    window: 60,
    max: 60,
    customRules: { "/sign-in/social": { window: 60, max: 10 }, "/callback/*": { window: 60, max: 10 } },
  },
  advanced: { disableCSRFCheck: false },
  plugins: [nextCookies()],
});
