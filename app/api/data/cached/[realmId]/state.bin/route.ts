import { type NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
import { BlizzardService } from '@/src/services/blizzard';
import { AuctionAggregator } from '@/src/services/aggregator';
import {
  badRequest,
  enforceRateLimit,
  parseRealmId,
  upstreamError,
} from '@/src/utils/apiGuard';

/**
 * Full realm state blob.
 *
 * A cache miss here fetches and processes an entire snapshot, so the route is
 * rate limited like the per-item one. Slightly looser budget: the dashboard
 * requests this once per realm on load and on every pipeline completion.
 */

/** 30 requests per minute per client. */
const LIMIT = 30;
const WINDOW_MS = 60_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ realmId: string }> }
) {
  const limited = enforceRateLimit(req, 'state-bin', LIMIT, WINDOW_MS);
  if (limited) return limited;

  try {
    const { realmId } = await params;

    // Previously `parseInt(realmId, 10) || 4401`, which turned any junk input
    // into a valid request against the default realm. The segment is always
    // present in the route, so an unparseable value is a client error.
    const connectedRealmId = parseRealmId(realmId);
    if (connectedRealmId === null) {
      return badRequest('realmId must be a positive integer');
    }

    const r2 = new R2Service();
    const stateKey = R2Service.generateStateKey(connectedRealmId);

    let buffer = await r2.getBin(stateKey);

    // If not cached yet, bootstrap snapshot immediately. A cache miss means
    // we have nothing to serve, so this must be a real fetch; a 304 would
    // leave the route with no data and no explanation.
    if (!buffer) {
      const blizzard = new BlizzardService();
      const { snapshot } = await blizzard.fetchAuctionSnapshot(connectedRealmId, true);
      await AuctionAggregator.processSnapshot(connectedRealmId, snapshot, r2);
      buffer = await r2.getBin(stateKey);
    }

    if (!buffer) {
      return new NextResponse('State data not available', { status: 404 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `inline; filename="state.bin"`,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'X-WoW-AH-Codec': 'UNDR-v1',
      },
    });
  } catch (err: unknown) {
    return upstreamError(err, 'data/cached state.bin');
  }
}
