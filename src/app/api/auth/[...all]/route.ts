import { toNextJsHandler } from "better-auth/next-js";
import { auth, authConfigured } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";
const handlers = toNextJsHandler(auth);

// Sign-in may be configured without Google (AUTH-02): sign-out and the session routes must still work (#49).
// Google's own routes need no gate here: without its settings the provider is not registered.
const notConfigured = () => Response.json({ error: "Sign-in is not configured on this server." }, { status: 503 });

export async function GET(request: Request) {
  if (!authConfigured) return notConfigured();
  return handlers.GET(request);
}

export async function POST(request: Request) {
  if (!authConfigured) return notConfigured();
  return handlers.POST(request);
}
