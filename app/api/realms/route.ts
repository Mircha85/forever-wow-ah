import { type NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
import { BlizzardService } from '@/src/services/blizzard';
import { badRequest, enforceRateLimit, upstreamError } from '@/src/utils/apiGuard';

export interface RealmListEntry {
  id: number;
  region: 'eu' | 'us';
  name: string;
  lastUpdated: string | null;
}

/** In-memory cache of (product, region, realmId) → name. Survives only as
 *  long as the Next.js process does; refetches on cold start. Acceptable
 *  here because Blizzard's connected-realm endpoint is rate-limited but
 *  cheap, and the cache hits amortise across dashboard renders. */
const NAME_CACHE = (globalThis as {
  __realmNameCache?: Map<string, string>;
}).__realmNameCache ??= new Map<string, string>();

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
    const blizzard = new BlizzardService({ region });
    const { prefixes } = await r2.listKeys(`data/cached/${product}/${region}/`, '/');

    const realms: RealmListEntry[] = [];
    for (const prefix of prefixes) {
      const match = prefix.match(/^data\/cached\/[^/]+\/[^/]+\/(\d+)\/$/);
      if (!match) continue;
      const id = Number(match[1]);
      const cacheKey = `${product}:${region}:${id}`;
      let name = NAME_CACHE.get(cacheKey);
      if (!name) {
        try {
          const live = await blizzard.fetchConnectedRealmName(id);
          name = live ?? `#${id}`;
        } catch {
          name = `#${id}`;
        }
        NAME_CACHE.set(cacheKey, name);
      }
      const meta = await r2.getBinMetadata(`data/cached/${product}/${region}/${id}/state.bin`);
      realms.push({
        id,
        region,
        name,
        lastUpdated: meta?.lastModified ? meta.lastModified.toISOString() : null,
      });
    }

    realms.sort((a, b) => a.id - b.id);

    return NextResponse.json({ region, product, realms });
  } catch (err: unknown) {
    return upstreamError(err, 'realms-list');
  }
}