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

const PRODUCTS = ['retail', 'forever'] as const;
type Product = typeof PRODUCTS[number];

/** 30 requests per minute per client. */
const LIMIT = 30;
const WINDOW_MS = 60_000;

/**
 * Region-aware + product-aware state blob route.
 *
 *   /api/data/cached/{product}/{region}/{realmId}/state.bin
 *
 * `product` distinguishes Retail (current test target) from WoW: Forever
 * (live 2026-11-04). Keeping it in the URL means a single Cloud Run
 * deployment serves both data trees without route conflict.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ product: string; region: string; realmId: string }> }
) {
  const limited = enforceRateLimit(req, 'state-bin-v3', LIMIT, WINDOW_MS);
  if (limited) return limited;

  try {
    const { product, region, realmId } = await params;

    if (!(PRODUCTS as readonly string[]).includes(product)) {
      return badRequest(`product must be one of: ${PRODUCTS.join(', ')}`);
    }
    if (region !== 'eu' && region !== 'us') {
      return badRequest('region must be "eu" or "us"');
    }
    const connectedRealmId = parseRealmId(realmId);
    if (connectedRealmId === null) {
      return badRequest('realmId must be a positive integer');
    }

    const r2 = new R2Service();
    const stateKey = R2Service.generateStateKey(product as Product, region, connectedRealmId);

    let buffer = await r2.getBin(stateKey);

    if (!buffer) {
      const blizzard = new BlizzardService({
        region,
        namespace: product === 'forever' ? `dynamic-classicann-${region}` : `dynamic-${region}`,
      });
      const { snapshot } = await blizzard.fetchAuctionSnapshot(connectedRealmId, true);
      await AuctionAggregator.processSnapshot(
        product as Product,
        region,
        connectedRealmId,
        snapshot,
        r2
      );
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
        'X-WoW-AH-Product': product,
        'X-WoW-AH-Region': region,
      },
    });
  } catch (err: unknown) {
    return upstreamError(err, 'data/cached state.bin v3');
  }
}