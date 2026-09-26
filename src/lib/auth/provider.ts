import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authAccount, authSession, authUser, authVerification, portalUsers } from "@/db/schema";

export const googleAuthConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  && process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length >= 32
  && process.env.BETTER_AUTH_URL,
);

// Even a misconfigured deployment fails closed: without provider credentials
// there is no sign-in endpoint, and no internal route is allowed anonymously.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "unconfigured-local-auth-secret-do-not-use-for-login",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
  }),
  emailAndPassword: { enabled: false },
  socialProviders: googleAuthConfigured ? {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      requireEmailVerification: true,
      prompt: "select_account",
    },
  } : {},
  user: {
    validateUserInfo: async ({ user, source }) => {
      if (source.method !== "oauth" || source.oauth?.providerId !== "google") return { error: "provider_not_allowed" };
      const email = user.email?.trim().toLowerCase();
      if (!email) return { error: "email_required" };
      const [invitation] = await db.select({ status: portalUsers.status })
        .from(portalUsers).where(eq(portalUsers.email, email)).limit(1);
      if (!invitation || !["invited", "active"].includes(invitation.status)) return { error: "account_not_invited" };
    },
  },
  session: { cookieCache: { enabled: false } },
  advanced: { disableCSRFCheck: false },
});
