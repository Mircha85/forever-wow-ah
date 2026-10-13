import { type NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
import { BlizzardService } from '@/src/services/blizzard';
import { AuctionAggregator } from '@/src/services/aggregator';
import {
  badRequest,
  enforceRateLimit,
  parseItemId,
  parseRealmId,
  upstreamError,
} from '@/src/utils/apiGuard';

const PRODUCTS = ['retail', 'forever'] as const;
type Product = typeof PRODUCTS[number];

/** 60 requests per minute per client. */
const LIMIT = 60;
const WINDOW_MS = 60_000;

/**
 * Per-item binary blob with product + region partition.
 *
 *   /api/data/cached/{product}/{region}/{realmId}/{shard}/{itemId}.bin
 *
 * `{shard}` is `itemId & 0xff` — preserved in the URL for layout reasons but
 * the route extracts `itemId` from the filename, not the shard.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ product: string; region: string; realmId: string; hash: string; file: string }> }
) {
  const limited = enforceRateLimit(req, 'item-bin-v3', LIMIT, WINDOW_MS);
  if (limited) return limited;

  try {
    const { product, region, realmId, file } = await params;

    if (!(PRODUCTS as readonly string[]).includes(product)) {
      return badRequest(`product must be one of: ${PRODUCTS.join(', ')}`);
    }
    if (region !== 'eu' && region !== 'us') {
      return badRequest('region must be "eu" or "us"');
    }
    const parsedRealmId = parseRealmId(realmId);
    if (parsedRealmId === null) {
      return badRequest('realmId must be a positive integer');
    }

    const itemId = parseItemId(file.replace(/\.bin$/i, ''));
    if (itemId === null) {
      return badRequest('file must be <itemId>.bin with a positive integer id');
    }

    const r2 = new R2Service();
    const itemKey = R2Service.generateItemKey(
      product as Product,
      region,
      parsedRealmId,
      itemId
    );

    let buffer = await r2.getBin(itemKey);

    if (!buffer) {
      try {
        const blizzard = new BlizzardService({
          region,
          namespace: product === 'forever' ? `dynamic-classicann-${region}` : `dynamic-${region}`,
        });
        const { snapshot } = await blizzard.fetchAuctionSnapshot(parsedRealmId);
        await AuctionAggregator.processSnapshot(
          product as Product,
          region,
          parsedRealmId,
          snapshot,
          r2
        );
        buffer = await r2.getBin(itemKey);
      } catch (e) {
        console.warn(`[API] Snapshot processing fallback for item #${itemId}:`, e);
      }
    }

    if (!buffer) {
      buffer = await AuctionAggregator.generateSingleItemBin(
      product as Product,
      region,
      parsedRealmId,
      itemId,
      r2
    );
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
        'X-WoW-AH-Product': product,
        'X-WoW-AH-Region': region,
      },
    });
  } catch (err: unknown) {
    return upstreamError(err, 'data/cached/[file] v3');
  }
}