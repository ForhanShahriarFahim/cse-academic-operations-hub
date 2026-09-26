import { toNextJsHandler } from "better-auth/next-js";
import { auth, googleAuthConfigured } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";
const handlers = toNextJsHandler(auth);

export async function GET(request: Request) {
  if (!googleAuthConfigured) return Response.json({ error: "Google sign-in is not configured." }, { status: 503 });
  return handlers.GET(request);
}

export async function POST(request: Request) {
  if (!googleAuthConfigured) return Response.json({ error: "Google sign-in is not configured." }, { status: 503 });
  return handlers.POST(request);
}
