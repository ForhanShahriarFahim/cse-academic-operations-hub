/**
 * AUTH-02: a small in-memory request throttle per client address, for the
 * password sign-in and link actions. One server process keeps its own counts;
 * account lockout (stored in the database) is the limit that survives restarts.
 * Client addresses come from proxy headers, which DEP-01 must pin to a trusted proxy.
 */

export interface ThrottleRule { max: number; windowMs: number }

export const THROTTLE_RULES = {
  "sign-in": { max: 10, windowMs: 60_000 },
  link: { max: 20, windowMs: 60_000 },
} as const satisfies Record<string, ThrottleRule>;

export type ThrottleBucket = keyof typeof THROTTLE_RULES;

const MAX_KEYS = 10_000;

export class Throttle {
  private readonly hits = new Map<string, number[]>();

  /** Records one attempt and says whether it is within the rule. */
  allow(bucket: ThrottleBucket, client: string, now = Date.now()): boolean {
    const rule = THROTTLE_RULES[bucket];
    const key = `${bucket}:${client}`;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > now - rule.windowMs);
    const allowed = recent.length < rule.max;
    if (allowed) recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    // Bound memory: forget the least recently used client first.
    while (this.hits.size > MAX_KEYS) this.hits.delete(this.hits.keys().next().value!);
    return allowed;
  }
}

export const requestThrottle = new Throttle();

export function clientAddress(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}
