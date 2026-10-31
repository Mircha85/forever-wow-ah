import { type NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
import { readRealmItem, readHistoryItem } from '@/src/services/realmArchive';
import { loadRealmArchives } from '@/src/services/realmCache';
import { composeItemBin } from '@/src/services/itemView';
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
 * Per-item view of a realm's auction data.
 *
 *   /api/data/cached/{product}/{region}/{realmId}/{shard}/{itemId}.bin
 *
 * `{shard}` is `{itemId} & 0xff` — preserved in the URL for layout
 * reasons but the route extracts `itemId` from the filename, not the shard.
 *
 * The response is the same `UNDR v1` item blob the dashboard has always
 * received. What changed is where it comes from: the ingestion pipeline
 * now writes two objects per realm — an item archive and an observation
 * history — and this route composes the item view from them.
 *
 * It used to be a third object, written per item per realm per run: at
 * 15 700 items across 175 realms on a 30-minute schedule that was ~3.96
 * billion R2 requests a month and 195 seconds per realm.
 *
 * The route is read-only. It never calls Battle.net and never writes.
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
    const loaded = await loadRealmArchives(
      r2,
      product as Product,
      region,
      parsedRealmId
    );

    // Two different "not there yet" cases, and they are worth telling
    // apart: the realm has never been ingested, or the realm has been
    // ingested but this item was not listed in it.
    if (!loaded) {
      return notIngested(
        `No ingested data for realm ${parsedRealmId} (${product}/${region}).`,
        'Run the ingestion pipeline (POST /api/pipeline/run) for this realm.'
      );
    }

    const item = readRealmItem(loaded.realm, itemId);
    if (!item) {
      return notIngested(
        `Item #${itemId} was not listed in realm ${parsedRealmId} at the last ingestion.`,
        'It may have sold, expired, or been delisted since then.'
      );
    }

    const historyItem = loaded.history
      ? readHistoryItem(loaded.history, itemId)
      : null;

    const buffer = composeItemBin({
      realm: loaded.realm,
      item,
      history: loaded.history,
      historyItem,
    });
    if (!buffer) {
      return notIngested(
        `No view available for item #${itemId} in realm ${parsedRealmId}.`,
        'Re-run the ingestion pipeline for this realm.'
      );
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `inline; filename="${itemId}.bin"`,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
        'X-WoW-AH-Codec': 'UNDR-v1',
        'X-WoW-AH-Product': product,
        'X-WoW-AH-Region': region,
      },
    });
  } catch (err: unknown) {
    return upstreamError(err, 'data/cached/[file] v3');
  }
}

/**
 * A 404 that says what is missing.
 *
 * Both former behaviours of this route were removed: rebuilding the realm
 * from Battle.net on a miss (a 10-25 MB payload, a rewrite of every
 * per-item blob, reachable by anyone) and generating a synthetic item
 * blob with fixed placeholder prices that was then persisted to R2. A
 * missing item now answers honestly instead of inventing one.
 */
function notIngested(error: string, hint: string): NextResponse {
  return new NextResponse(JSON.stringify({ error, hint }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'X-WoW-AH-Source': 'not-ingested',
    },
  });
}
