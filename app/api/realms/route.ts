import { type NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
import { badRequest, enforceRateLimit } from '@/src/utils/apiGuard';

export interface RealmListEntry {
  id: number;
  region: 'eu' | 'us';
  lastUpdated: string | null;
}

/** 60 requests per minute per IP — dashboard polls on mount + after each run. */
const LIMIT = 60;
const WINDOW_MS = 60_000;

/**
 * Lists connected realms with a cached `state.bin` under
 * `data/cached/{product}/{region}/{connectedRealmId}/state.bin`.
 *
 * `product` is required. Defaults to 'retail' for backwards compat with
 * existing clients that don't pass it.
 */
export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, 'realms-list', LIMIT, WINDOW_MS);
  if (limited) return limited;

  const region = req.nextUrl.searchParams.get('region');
  const product = (req.nextUrl.searchParams.get('product') ?? 'retail') as 'retail' | 'forever';
  if (region !== 'eu' && region !== 'us') {
    return badRequest('region must be "eu" or "us"');
  }
  if (product !== 'retail' && product !== 'forever') {
    return badRequest('product must be "retail" or "forever"');
  }

  try {
    const r2 = new R2Service();
    const { prefixes } = await r2.listKeys(`data/cached/${product}/${region}/`, '/');

    const realms: RealmListEntry[] = [];
    for (const prefix of prefixes) {
      const match = prefix.match(/^data\/cached\/[^/]+\/[^/]+\/(\d+)\/$/);
      if (!match) continue;
      const id = Number(match[1]);
      const meta = await r2.getBinMetadata(`data/cached/${product}/${region}/${id}/state.bin`);
      realms.push({
        id,
        region,
        lastUpdated: meta?.lastModified ? meta.lastModified.toISOString() : null,
      });
    }

    realms.sort((a, b) => a.id - b.id);

    return NextResponse.json({ region, product, realms });
  } catch (err: unknown) {
    return new NextResponse(
      `Failed to list realms: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 }
    );
  }
}