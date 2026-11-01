import { type NextRequest, NextResponse } from 'next/server';
import { R2Service } from '@/src/services/r2';
import { badRequest, enforceRateLimit, upstreamError } from '@/src/utils/apiGuard';

export interface RealmListEntry {
  id: number;
  region: 'eu' | 'us';
  name: string;
  lastUpdated: string | null;
}

/** 60 requests per minute per IP — dashboard polls on mount + after each run. */
const LIMIT = 60;
const WINDOW_MS = 60_000;

/**
 * How long a computed listing is reused.
 *
 * Building the listing costs one LIST plus one HEAD per realm — 175 of
 * them for the full set. Without a cache, 60 requests a minute from one
 * client would mean 10 500 HEAD requests a minute against the bucket.
 */
const LISTING_TTL_MS = 60_000;

interface CachedListing {
  at: number;
  realms: RealmListEntry[];
}

const LISTING_CACHE = new Map<string, CachedListing>();

/**
 * Lists connected realms that have an ingested `state.bin` under
 * `data/cached/{product}/{region}/{connectedRealmId}/`.
 *
 * The route is a pure read of R2. It used to resolve each realm's display
 * name by calling Battle.net, which meant one public request could fan
 * out into 175 upstream calls — an amplification vector against a shared
 * API key, on a route anybody can hit. The names are now resolved by the
 * ingestion pipeline and read from `names.json`.
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
    const realms = await listRealms(r2, product, region);

    return NextResponse.json({ region, product, realms });
  } catch (err: unknown) {
    return upstreamError(err, 'realms-list');
  }
}

/**
 * The realm listing, computed at most once a minute per region.
 */
async function listRealms(
  r2: R2Service,
  product: 'retail' | 'forever',
  region: 'eu' | 'us'
): Promise<RealmListEntry[]> {
  const key = `${product}:${region}`;
  const cached = LISTING_CACHE.get(key);
  const now = Date.now();
  if (cached && now - cached.at < LISTING_TTL_MS) {
    return cached.realms;
  }

  const names = await loadRealmNames(r2, product, region);
  const { prefixes } = await r2.listKeys(`data/cached/${product}/${region}/`, '/');

  const realms: RealmListEntry[] = [];
  for (const prefix of prefixes) {
    const match = prefix.match(/^data\/cached\/[^/]+\/[^/]+\/(\d+)\/$/);
    if (!match) continue;
    const id = Number(match[1]);
    const meta = await r2.getBinMetadata(
      `data/cached/${product}/${region}/${id}/state.bin`
    );
    realms.push({
      id,
      region,
      // The name comes from what the pipeline resolved. When it is not
      // known yet, the numeric id is shown — honest about being
      // unresolved rather than invented.
      name: names[String(id)] ?? `#${id}`,
      lastUpdated: meta?.lastModified ? meta.lastModified.toISOString() : null,
    });
  }

  realms.sort((a, b) => a.id - b.id);

  LISTING_CACHE.set(key, { at: now, realms });
  while (LISTING_CACHE.size > 4) {
    const oldest = LISTING_CACHE.keys().next();
    if (oldest.done) break;
    LISTING_CACHE.delete(oldest.value);
  }

  return realms;
}

/**
 * Reads the realm names the ingestion pipeline resolved.
 *
 * A missing or unreadable file is not an error: the listing falls back to
 * numeric ids, which is what it showed before the names existed.
 */
async function loadRealmNames(
  r2: R2Service,
  product: 'retail' | 'forever',
  region: 'eu' | 'us'
): Promise<Record<string, string>> {
  const raw = await r2.getBin(R2Service.generateRealmNamesKey(product, region));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw.toString('utf8')) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
