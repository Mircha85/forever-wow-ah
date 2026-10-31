import { type NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
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

    const buffer = await r2.getBin(stateKey);

    // Read-only route. A cache miss means this realm has not been ingested
    // yet, and the answer is a loud 404 — never a rebuild.
    //
    // The previous implementation fetched the full realm snapshot from
    // Battle.net on every miss and re-ran the whole aggregation, which
    // meant one public GET could:
    //   - burn a Battle.net quota slot on a 10-25 MB JSON payload
    //   - rewrite state.bin and every per-item blob for the realm
    //   - hold the entire snapshot in memory on a Vercel Hobby instance
    //   - be triggered 30 times a minute by anyone who knows 30 realm ids
    //
    // Ingestion is the bearer-gated pipeline's job: POST /api/pipeline/run.
    // This route only reads what the pipeline produced.
    if (!buffer) {
      return new NextResponse(
        JSON.stringify({
          error: `No ingested state for realm ${connectedRealmId} (${product}/${region}).`,
          hint: 'Run the ingestion pipeline (POST /api/pipeline/run) for this realm.',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'X-WoW-AH-Source': 'not-ingested',
          },
        }
      );
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