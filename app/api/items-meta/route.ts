import { type NextRequest, NextResponse } from 'next/server';
import { type WowItemMetadata } from '@/src/types/auction';
import { BlizzardService } from '@/src/services/blizzard';
import {
  getCachedMetadata,
  warmMetadataForIds,
  type WarmResult,
} from '@/src/services/itemMetadataCache';
import {
  badRequest,
  enforceRateLimit,
  parseItemId,
  parseRealmId,
  upstreamError,
} from '@/src/utils/apiGuard';

/**
 * Batch item metadata lookup.
 *
 * The dashboard renders hundreds of rows from the state's 15k+ unique
 * items, most of which are not in the hardcoded `WOW_ITEMS_CATALOG`. The
 * fallback "Unknown Item #X" never matches a category, so the user sees a
 * table full of the few catalog rows they recognise.
 *
 * This endpoint warms Blizzard metadata for the requested ids into the
 * server-side cache and returns whatever it has. Repeated requests for
 * the same ids are essentially free after the first hit.
 *
 *   GET /api/items-meta?ids=16204,13468,12360&realmId=1305
 *     → 200 `{ items: WowItemMetadata[], warm: WarmResult }`
 *     → 400 when ids missing / unparseable / over the batch cap
 *     → 503 when Blizzard credentials are absent
 *     → 502 when Blizzard is misconfigured or rate-limited
 */

/** Cap the batch so a single client cannot pin the server on 15000 ids. */
const MAX_BATCH = 200;

/** 60 reqs per minute per client — matches the per-item binary route. */
const LIMIT = 60;
const WINDOW_MS = 60_000;

interface OkResponse {
  items: WowItemMetadata[];
  warm: WarmResult;
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, 'items-meta', LIMIT, WINDOW_MS);
  if (limited) return limited;

  try {
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

    const itemIds: number[] = [];
    for (const raw of rawIds) {
      const parsed = parseItemId(raw);
      if (parsed === null) {
        return badRequest(`invalid item id "${raw}"`);
      }
      itemIds.push(parsed);
    }

    // realmId is optional, kept for future per-realm logging.
    const realmIdRaw = searchParams.get('realmId');
    if (realmIdRaw) {
      const realmId = parseRealmId(realmIdRaw);
      if (realmId === null) {
        return badRequest('realmId must be a positive integer');
      }
    }

    const blizzard = new BlizzardService();
    if (!blizzard.hasCredentials()) {
      // Without credentials every row would be the synthetic fallback;
      // tell the caller explicitly rather than serving empty arrays that
      // look like a successful empty result.
      return new NextResponse(
        JSON.stringify({
          error: 'Blizzard credentials are not configured; cannot resolve real item metadata.',
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

    const items: WowItemMetadata[] = [];
    for (const id of itemIds) {
      const meta = getCachedMetadata(id);
      if (meta) items.push(meta);
    }

    const body: OkResponse = { items, warm };
    return NextResponse.json(body, {
      headers: {
        // Re-fetch on demand; metadata changes only when Blizzard ships a
        // patch, which the next pipeline run will reflect anyway.
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (err: unknown) {
    return upstreamError(err, 'items-meta');
  }
}
