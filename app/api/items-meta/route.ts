import { type NextRequest, NextResponse } from 'next/server';
import { type WowItemMetadata } from '@/src/types/auction';
import {
  getCachedMetadata,
  metadataCacheSize,
} from '@/src/services/itemMetadataCache';
import {
  badRequest,
  enforceRateLimit,
  parseItemId,
} from '@/src/utils/apiGuard';

/**
 * Public, cache-only item metadata lookup.
 *
 *   GET /api/items-meta?ids=16204,13468,12360
 *     → 200 `{ items: WowItemMetadata[], cached: number, cacheSize: number, source: "cache" }`
 *     → 400 when ids missing / unparseable / over the batch cap
 *
 * THIS ROUTE NO LONGER WARMS THE CACHE.
 *
 * Rationale. The previous implementation called `warmMetadataForIds`
 * inline, so an anonymous client could request 200 ids and trigger 200
 * Blizzard lookups per request. Combined with the 60 req/min per-client
 * rate limit that meant up to 12 000 Battle.net round-trips per minute
 * against a single user-controlled API key. A bearer guard at this
 * layer would also break the dashboard (which calls this route from the
 * browser without a token), so the response is split across two routes
 * instead:
 *
 *   - `GET  /api/items-meta`         ← public, cache-only read (this file)
 *   - `POST /api/items-meta/warm`    ← bearer-gated, performs the warm
 *
 * The pipeline (`POST /api/pipeline/run`) is also bearer-gated and warms
 * the top items of every successful run as a side effect, so the cache
 * is populated by the same cron jobs that produce state.bin. A cold
 * cache just means a few "Unknown Item #X" rows until the next pipeline
 * run — the same fallback the dashboard already renders for items
 * missing from the hardcoded `WOW_ITEMS_CATALOG`.
 *
 * The rate limit and batch cap remain as defence-in-depth in case a
 * future change reintroduces a billable side effect.
 */

/** Cap the batch so a single client cannot pin the server on 15 000 ids. */
const MAX_BATCH = 200;

/** 60 reqs per minute per client — same ceiling the per-item binary route uses. */
const LIMIT = 60;
const WINDOW_MS = 60_000;

interface OkResponse {
  items: WowItemMetadata[];
  /** How many of the requested ids actually had metadata in the cache. */
  cached: number;
  /** Total entries currently in the metadata cache. Informational. */
  cacheSize: number;
  source: 'cache';
}

// Deliberately not `async`: the handler is cache-only, so there is nothing to
// await. Next.js accepts a synchronous route handler.
export function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, 'items-meta', LIMIT, WINDOW_MS);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const idsRaw = searchParams.get('ids');
  if (!idsRaw) {
    return badRequest('ids query parameter required (comma-separated item ids)');
  }

  const rawIds = idsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (rawIds.length === 0) {
    return badRequest('ids query parameter required (comma-separated item ids)');
  }
  if (rawIds.length > MAX_BATCH) {
    return badRequest(`ids capped at ${MAX_BATCH} per request (got ${rawIds.length})`);
  }

  // De-duplicate while preserving the caller's order so the response
  // shape (and any per-row UI mapping by index) is stable.
  const seen = new Set<number>();
  const itemIds: number[] = [];
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

  // Cache-only read. This is the whole point of the split — there is no
  // upstream call here, no Blizzard fetcher, nothing to throttle beyond
  // a sane per-client request ceiling.
  const items: WowItemMetadata[] = [];
  for (const id of itemIds) {
    const meta = getCachedMetadata(id);
    if (meta) items.push(meta);
  }

  const body: OkResponse = {
    items,
    cached: items.length,
    cacheSize: metadataCacheSize(),
    source: 'cache',
  };

  return NextResponse.json(body, {
    headers: {
      // Re-fetch on demand; metadata changes only when Blizzard ships a
      // patch, which the next pipeline run will reflect anyway.
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
