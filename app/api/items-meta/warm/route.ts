import { type NextRequest, NextResponse } from 'next/server';
import { BlizzardService } from '@/src/services/blizzard';
import {
  warmMetadataForIds,
  metadataCacheSize,
  type WarmResult,
} from '@/src/services/itemMetadataCache';
import {
  badRequest,
  enforceRateLimit,
  parseItemId,
  requireBearer,
  upstreamError,
} from '@/src/utils/apiGuard';

/**
 * Bearer-gated metadata warming.
 *
 *   POST /api/items-meta/warm            ← body: { ids: number[] }
 *   GET  /api/items-meta/warm?ids=1,2,3  ← query string for curl-ability
 *
 *     Authorization: Bearer $PIPELINE_RUN_TOKEN
 *     → 200 `{ warm: WarmResult, cacheSize: number }`
 *     → 400 when ids missing / unparseable / over the batch cap
 *     → 401 without a valid bearer
 *     → 500 in production when PIPELINE_RUN_TOKEN is unset
 *     → 502 when Blizzard is misconfigured or rate-limited
 *
 * Why this exists. The public `GET /api/items-meta` is now cache-only —
 * see the rationale block in that file. Anything that needs to fetch
 * fresh metadata from Battle.net goes through this route, so the only
 * clients that can burn quota are the ones that already hold the
 * pipeline token (cron jobs, the embedded warming step of
 * `POST /api/pipeline/run`, ad-hoc operator calls).
 */

/** Match the public route's batch cap so a bearered client can't go higher. */
const MAX_BATCH = 200;

/**
 * 30 warm calls per minute per bearer holder. With `warmMetadataForIds`
 * itself running at concurrency 5 and the route honouring `MAX_BATCH`,
 * the worst case is 30 × 5 = 150 Blizzard fetches per second from one
 * bearer — far above the cron schedule's actual demand (a single realm
 * every 30 minutes), and bounded by Battle.net's own 429s if abused.
 */
const LIMIT = 30;
const WINDOW_MS = 60_000;

interface WarmOkResponse {
  warm: WarmResult;
  cacheSize: number;
}

/**
 * Normalise an `ids` field (number[], string[], or a single comma-joined
 * string) into an array of trimmed non-empty string ids. Returns null
 * when the input is not a recognised shape — callers convert that to a
 * 400. We accept strings rather than numbers here so the per-id type
 * check happens later via `parseItemId`.
 */
function extractIds(input: unknown): string[] | null {
  if (Array.isArray(input)) {
    const out = input
      .map((v) => (typeof v === 'number' ? String(v) : String(v ?? '').trim()))
      .filter(Boolean);
    return out.length > 0 ? out : null;
  }
  if (typeof input === 'string') {
    const out = input.split(',').map((s) => s.trim()).filter(Boolean);
    return out.length > 0 ? out : null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  // GET shape: `?ids=1,2,3` — useful for `curl` smoke tests.
  const raw = extractIds(req.nextUrl.searchParams.get('ids'));
  return handleWarm(req, raw);
}

export async function POST(req: NextRequest) {
  let raw: string[] | null = null;
  try {
    const body = (await req.json()) as { ids?: unknown };
    raw = extractIds(body?.ids);
  } catch {
    return badRequest('body must be valid JSON with an `ids` field');
  }
  return handleWarm(req, raw);
}

async function handleWarm(req: NextRequest, rawIds: string[] | null) {
  const unauthorized = requireBearer(req);
  if (unauthorized) return unauthorized;

  const limited = enforceRateLimit(req, 'items-meta-warm', LIMIT, WINDOW_MS);
  if (limited) return limited;

  if (!rawIds) {
    return badRequest(
      'ids required (JSON body `{ "ids": [1,2,3] }` or ?ids=1,2,3 query string)'
    );
  }
  if (rawIds.length > MAX_BATCH) {
    return badRequest(`ids capped at ${MAX_BATCH} per request (got ${rawIds.length})`);
  }

  const itemIds: number[] = [];
  const seen = new Set<number>();
  for (const raw of rawIds) {
    const parsed = parseItemId(raw);
    if (parsed === null) {
      return badRequest(`invalid item id "${raw}"`);
    }
    if (!seen.has(parsed)) {
      seen.add(parsed);
      itemIds.push(parsed);
    }
  }

  try {
    const blizzard = new BlizzardService();
    if (!blizzard.hasCredentials()) {
      // Fail closed. Without credentials there is no upstream to warm
      // against; returning a successful empty warm would just hide the
      // misconfiguration behind a "no-op" green light.
      return new NextResponse(
        JSON.stringify({
          error: 'Blizzard credentials are not configured; cannot warm metadata.',
          source: 'synthetic_forever',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const warm = await warmMetadataForIds(
      (id) => blizzard.fetchItemMetadata(id),
      itemIds
    );

    const responseBody: WarmOkResponse = {
      warm,
      // Total cache size across all prior warms, not just this call —
      // dashboards use it as a quick "is metadata warm?" signal.
      cacheSize: metadataCacheSize(),
    };

    return NextResponse.json(responseBody);
  } catch (err: unknown) {
    return upstreamError(err, 'items-meta/warm');
  }
}
