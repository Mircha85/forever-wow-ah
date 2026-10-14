import { timingSafeEqual } from 'node:crypto';

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

/** Default realm used when a caller omits one. (Was Silvermoon historically;
 *  no longer tied to any hardcoded list — see /api/realms for live IDs.) */
export const DEFAULT_REALM_ID = 1305;

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
 * Shape of `Authorization: Bearer <token>` accepted by `requireBearer`.
 *
 * The body must be 16-512 chars from a deliberately narrow alphabet
 * (base64url + `._\-+/=`). Anything else is rejected with 401 before the
 * constant-time compare runs, so a malformed probe cannot distinguish
 * "missing token" from "wrong token" and cannot be used to feed garbage
 * into the comparator.
 */
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9._\-+/=]{16,512})$/;

const BEARER_UNAUTHORIZED = (): NextResponse =>
  new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

const BEARER_MISCONFIGURED = (): NextResponse =>
  new NextResponse(
    JSON.stringify({ error: 'Pipeline is not configured for this environment' }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }
  );

/**
 * Gate that requires a static bearer token configured via
 * `PIPELINE_RUN_TOKEN`. Used by routes that trigger billable upstream work
 * (Battle.net snapshot, R2 writes) and were reachable by anyone before this
 * guard existed.
 *
 * Behaviour:
 *  - Production (`NODE_ENV === 'production'`): the env var MUST be set. If
 *    it is missing, the request fails closed with 500 rather than silently
 *    opening the route. This is the "fail loud" half of bulletproof.
 *  - Non-production: missing env var falls open so `npm run dev` keeps
 *    working without ceremony, while every other rejection path still
 *    returns 401.
 *  - Comparison is `crypto.timingSafeEqual` over equal-length buffers. A
 *    zero-pad to the longer length keeps the call constant-time even when
 *    the supplied token has a different length from the configured one.
 *  - Every reject path returns the same opaque 401 body, so a probe cannot
 *    distinguish "no header", "wrong scheme", "wrong token", or "bad
 *    length" from one another.
 *
 * Returns `null` on success, otherwise a ready-to-return `NextResponse`.
 */
export function requireBearer(req: Request): NextResponse | null {
  const expected = process.env.PIPELINE_RUN_TOKEN;

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[API] requireBearer: PIPELINE_RUN_TOKEN is not configured; refusing pipeline request.'
      );
      return BEARER_MISCONFIGURED();
    }
    return null;
  }

  const header = req.headers.get('authorization');
  if (!header) return BEARER_UNAUTHORIZED();

  const match = BEARER_PATTERN.exec(header);
  if (!match) return BEARER_UNAUTHORIZED();

  const supplied = match[1] ?? '';

  const maxLen = Math.max(expected.length, supplied.length);
  const expectedBuf = Buffer.alloc(maxLen);
  const suppliedBuf = Buffer.alloc(maxLen);
  expectedBuf.write(expected);
  suppliedBuf.write(supplied);

  const equal = timingSafeEqual(expectedBuf, suppliedBuf);
  if (!equal || supplied.length !== expected.length) {
    return BEARER_UNAUTHORIZED();
  }

  return null;
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
