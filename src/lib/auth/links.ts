import { createHash, randomBytes } from "node:crypto";

/**
 * AUTH-02 one-time setup and reset links. The token rides in the URL fragment,
 * which browsers never send to the server or in a Referer header; only its
 * SHA-256 hash is stored (account_links.token_hash).
 */
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const newLinkToken = () => randomBytes(TOKEN_BYTES).toString("base64url");

export const hashLinkToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

/** A token as the set-password page received it, or null when it cannot be one. */
export function parseLinkToken(value: unknown): string | null {
  return typeof value === "string" && TOKEN_PATTERN.test(value) ? value : null;
}

export function linkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/set-password#t=${token}`;
}
