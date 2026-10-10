/**
 * Minimal in-process sliding-window rate limiter.
 *
 * WHY THIS EXISTS
 * ---------------
 * `POST /api/pipeline/run` and the cache-miss path of
 * `GET /api/data/cached/...` both trigger a full Battle.net snapshot fetch plus
 * aggregation and R2 writes. They were reachable by anyone, unauthenticated and
 * unthrottled, so a single client could burn the whole API quota and generate
 * unbounded storage cost.
 *
 * KNOWN LIMITATION — read this before relying on it
 * -------------------------------------------------
 * State lives in the module's memory, so the limit is **per server instance**
 * and resets on every cold start, scale-out or redeploy. On Cloud Run that
 * means N instances allow roughly N x `limit` per window. That is still enough
 * to stop a single anonymous client and casual abuse, which is the goal here.
 *
 * If you later need a hard global guarantee, swap the Map for a shared store
 * (Redis / Cloudflare KV / Durable Object) and keep the same function
 * signature — nothing else has to change.
 */

interface WindowEntry {
  /** Timestamps (ms) of the requests still inside the window. */
  hits: number[];
  /** Epoch ms after which this entry is safe to drop entirely. */
  expiresAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the oldest hit leaves the window. 0 when allowed. */
  retryAfterSeconds: number;
}

const buckets = new Map<string, WindowEntry>();

/** How often to sweep expired buckets, in ms. */
const SWEEP_INTERVAL_MS = 60_000;

let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, entry] of buckets) {
    if (entry.expiresAt <= now) {
      buckets.delete(key);
    }
  }
}

/**
 * Record a hit against `key` and report whether it is allowed.
 *
 * A rejected request is NOT recorded, so a client hammering a closed window
 * does not extend it indefinitely.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const cutoff = now - windowMs;
  const entry = buckets.get(key);
  const hits = entry ? entry.hits.filter((t) => t > cutoff) : [];

  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    if (entry) {
      entry.hits = hits;
      entry.expiresAt = oldest + windowMs;
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, {
    hits,
    expiresAt: (hits[0] ?? now) + windowMs,
  });

  return {
    allowed: true,
    remaining: limit - hits.length,
    retryAfterSeconds: 0,
  };
}

/**
 * Best-effort client identity for rate limiting.
 *
 * Cloud Run and every reverse proxy in front of it set `x-forwarded-for`.
 * The left-most entry is the original client. The header is trivially
 * spoofable, so this throttles *accidents* rather than a determined attacker —
 * which is the correct expectation for an in-memory limiter.
 *
 * `Vercel`/`Cloudflare` style `x-real-ip` is used as a fallback.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? 'unknown';
}
