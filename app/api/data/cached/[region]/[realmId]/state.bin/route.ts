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

/** 30 requests per minute per client. */
const LIMIT = 30;
const WINDOW_MS = 60_000;

/**
 * Region-aware state blob route. New layout:
 *   /api/data/cached/{region}/{realmId}/state.bin
 *
 * The legacy `/api/data/cached/{realmId}/state.bin` route still serves
 * the same blob (path is independent of the R2 key inside the handler),
 * but new client code should use this version.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ region: string; realmId: string }> }
) {
  const limited = enforceRateLimit(req, 'state-bin-v2', LIMIT, WINDOW_MS);
  if (limited) return limited;

  try {
    const { region, realmId } = await params;

    if (region !== 'eu' && region !== 'us') {
      return badRequest('region must be "eu" or "us"');
    }

    const connectedRealmId = parseRealmId(realmId);
    if (connectedRealmId === null) {
      return badRequest('realmId must be a positive integer');
    }

    const r2 = new R2Service();
    const stateKey = R2Service.generateStateKey(connectedRealmId);

    let buffer = await r2.getBin(stateKey);

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
        'X-WoW-AH-Region': region,
      },
    });
  } catch (err: unknown) {
    return upstreamError(err, 'data/cached state.bin v2');
  }
}