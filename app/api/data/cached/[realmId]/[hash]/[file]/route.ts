import { type NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
import { BlizzardService } from '@/src/services/blizzard';
import { AuctionAggregator } from '@/src/services/aggregator';
import {
  badRequest,
  enforceRateLimit,
  internalError,
  parseItemId,
  parseRealmId,
} from '@/src/utils/apiGuard';

/**
 * Per-item binary blob.
 *
 * On a cache miss this route fetches a full Battle.net snapshot and can
 * generate a single item record on demand. Both are outbound, billable work
 * reachable with an arbitrary itemId, so it is rate limited here too — the
 * per-item cache miss is a cheap way for one client to force repeated
 * aggregation.
 *
 * The limit is deliberately looser than pipeline/run: this is the dashboard's
 * normal read path and real users page through many items.
 */

/** 60 requests per minute per client. */
const LIMIT = 60;
const WINDOW_MS = 60_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ realmId: string; hash: string; file: string }> }
) {
  const limited = enforceRateLimit(req, 'item-bin', LIMIT, WINDOW_MS);
  if (limited) return limited;

  try {
    const { realmId, file } = await params;

    const parsedRealmId = parseRealmId(realmId);
    if (parsedRealmId === null) {
      return badRequest('realmId must be a positive integer');
    }

    // The [file] segment carries "<itemId>.bin"; strip the extension explicitly
    // instead of relying on parseInt, which would happily accept "12abc".
    const itemId = parseItemId(file.replace(/\.bin$/i, ''));
    if (itemId === null) {
      return badRequest('file must be <itemId>.bin with a positive integer id');
    }

    const r2 = new R2Service();
    const itemKey = R2Service.generateItemKey(parsedRealmId, itemId);

    let buffer = await r2.getBin(itemKey);

    // If item not cached yet, bootstrap realm snapshot
    if (!buffer) {
      try {
        const blizzard = new BlizzardService();
        const { snapshot } = await blizzard.fetchAuctionSnapshot(parsedRealmId);
        await AuctionAggregator.processSnapshot(parsedRealmId, snapshot, r2);
        buffer = await r2.getBin(itemKey);
      } catch (e) {
        console.warn(`[API] Snapshot processing fallback for item #${itemId}:`, e);
      }
    }

    // If still not present in buffer, generate single item record directly on-demand
    if (!buffer) {
      buffer = await AuctionAggregator.generateSingleItemBin(parsedRealmId, itemId, r2);
    }

    if (!buffer) {
      return badRequest(`No data available for item #${itemId}`);
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `inline; filename="${itemId}.bin"`,
        'Cache-Control': 'public, max-age=900, stale-while-revalidate=1800',
        'X-WoW-AH-Codec': 'UNDR-v1',
      },
    });
  } catch (err: unknown) {
    return internalError(err, 'data/cached/[file]');
  }
}
