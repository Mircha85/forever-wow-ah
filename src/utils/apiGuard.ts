import { NextResponse } from 'next/server';
import {
  checkRateLimit,
  clientKeyFromHeaders,
  type RateLimitResult,
} from './rateLimit';
import { BlizzardApiError } from '../services/blizzard';

/**
 * Shared guards for the App Router API surface.
 *
 * All four routes under app/api/ are publicly reachable, and three of them can
 * trigger outbound Battle.net traffic or storage writes. These helpers keep the
 * limits and the error contract in one place instead of scattered per route.
 */

/** Upper bound for a Blizzard realm id. Real ids are small (4401, 3678, ...). */
export const MAX_REALM_ID = 1_000_000;

/** Upper bound for a WoW item id. */
export const MAX_ITEM_ID = 5_000_000;

/**
 * Parse and bound an id taken from the URL.
 *
 * The routes previously did `parseInt(raw, 10) || default`, which silently
 * turned garbage into a valid-looking id — `realmId=/etc` became the default
 * realm and was fetched anyway. Returns null when the input is not a positive
 * in-range integer, so the caller can answer 400 instead of doing work.
 */
export function parseBoundedInt(
  raw: string | undefined,
  max: number
): number | null {
  if (!raw) return null;
  // Reject anything that is not a bare integer string, so "12abc" and "1e5"
  // do not slip through parseInt's prefix matching.
  if (!/^\d+$/.test(raw)) return null;

  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) return null;
  return value;
}

export const parseRealmId = (raw: string | undefined): number | null =>
  parseBoundedInt(raw, MAX_REALM_ID);

export const parseItemId = (raw: string | undefined): number | null =>
  parseBoundedInt(raw, MAX_ITEM_ID);

/** Default realm used when a caller omits one. Mirrors CONNECTED_REALMS[0]. */
export const DEFAULT_REALM_ID = 4401;

/**
 * Enforce a per-client limit for a named action.
 * Returns a 429 response when the caller is over budget, otherwise null.
 */
export function enforceRateLimit(
  request: Request,
  action: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const client = clientKeyFromHeaders(request.headers);
  const result = checkRateLimit(`${action}:${client}`, limit, windowMs);
  return result.allowed ? null : tooManyRequests(result);
}

export function tooManyRequests(result: RateLimitResult): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: 'Too many requests',
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    }
  );
}

export function badRequest(message: string): NextResponse {
  return new NextResponse(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Surface a Battle.net failure to the caller with its real reason.
 *
 * `internalError` deliberately answers with an opaque 500, which is right
 * for a bug in this codebase but wrong when the actual problem is an
 * upstream one: a wrong namespace, refused credentials, an exhausted quota
 * or a network fault all used to reach the client as an indistinguishable
 * "Internal server error", or worse, as a successful response full of
 * synthetic data.
 *
 * Only `BlizzardApiError` messages are forwarded; they name the namespace,
 * status and realm id and carry no credentials. The raw upstream body is
 * logged, not returned.
 */
export function upstreamError(err: unknown, context: string): NextResponse {
  if (err instanceof BlizzardApiError) {
    console.error(
      `[API] ${context} upstream failure:`,
      err.message,
      err.detail ? `| upstream said: ${err.detail}` : ''
    );

    // 429 keeps its meaning so a client can back off; everything else is
    // an upstream dependency failing, which is a bad gateway, not our bug.
    const status = err.status === 429 ? 503 : 502;

    return new NextResponse(
      JSON.stringify({
        error: err.message,
        source: 'blizzard_api',
        upstreamStatus: err.status ?? null,
        realmId: err.realmId ?? null,
        retryAfterMs: err.retryAfterMs ?? null,
      }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return internalError(err, context);
}

/**
 * Log the real cause server-side, return an opaque message to the caller.
 *
 * The routes used to interpolate the raw error into the response body, which
 * leaked upstream URLs, credential-related messages and internal structure to
 * anyone hitting the endpoint.
 */
export function internalError(
  err: unknown,
  context: string
): NextResponse {
  const cause = err instanceof Error ? err.message : String(err);
  console.error(`[API] ${context} failed:`, cause);
  return new NextResponse(
    JSON.stringify({ error: 'Internal server error' }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
