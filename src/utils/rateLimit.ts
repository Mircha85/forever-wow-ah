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
 * Trust order, from most to least trustworthy:
 *
 *  1. `x-vercel-forwarded-for` — set by Vercel's edge from the TCP source
 *     IP. Cannot be spoofed by a client-supplied header because Vercel
 *     overwrites it on the way in. Always present on Vercel Hobby.
 *  2. `cf-connecting-ip` — Cloudflare's edge equivalent, also set from
 *     TCP. Use this if the app is fronted by Cloudflare directly.
 *  3. `fly-client-ip` — Fly.io proxy's edge equivalent.
 *  4. `x-real-ip` — what `nginx`, Caddy, and most reverse proxies set to
 *     the client IP when they don't speak Vercel/CF/Fly. Trustworthy only
 *     if the operator controls the proxy.
 *  5. `x-forwarded-for` — last resort. The leftmost entry is client-
 *     controlled and trivially spoofable; without knowing how many
 *     trusted proxies are in the chain, we cannot pick safely. Kept only
 *     as a fallback for self-hosted setups that set nothing else.
 *
 * Callers that get nothing fall into the shared `"unknown"` bucket. This
 * is a deliberate DoS-hardening choice: the alternative is handing an
 * attacker a per-request bucket by letting them send a fresh XFF per call.
 * The in-memory limiter is documented as accident mitigation, not abuse
 * prevention.
 *
 * Header values that contain a comma-separated chain (some platforms
 * defensively append their own IP) are split and the first entry is used.
 */
const TRUSTED_IP_HEADERS = [
  'x-vercel-forwarded-for',
  'cf-connecting-ip',
  'fly-client-ip',
  'x-real-ip',
] as const;

function firstEntry(value: string): string | null {
  const first = value.split(',')[0]?.trim();
  return first ? first : null;
}

export function clientKeyFromHeaders(headers: Headers): string {
  for (const name of TRUSTED_IP_HEADERS) {
    const value = headers.get(name);
    if (value) {
      const first = firstEntry(value);
      if (first) return first;
    }
  }

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = firstEntry(forwarded);
    if (first) return first;
  }

  return 'unknown';
}
