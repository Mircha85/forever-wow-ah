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
 * `data/cached/{region}/{connectedRealmId}/state.bin`. Backed by R2
 * `ListObjectsV2` with `Delimiter='/'` so we get the realm directories
 * without enumerating every item blob.
 */
export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, 'realms-list', LIMIT, WINDOW_MS);
  if (limited) return limited;

  const region = req.nextUrl.searchParams.get('region');
  if (region !== 'eu' && region !== 'us') {
    return badRequest('region must be "eu" or "us"');
  }

  try {
    const r2 = new R2Service();
    const { prefixes } = await r2.listKeys(`data/cached/${region}/`, '/');

    const realms: RealmListEntry[] = [];
    for (const prefix of prefixes) {
      const match = prefix.match(/^data\/cached\/[^/]+\/(\d+)\/$/);
      if (!match) continue;
      const id = Number(match[1]);
      const meta = await r2.getBinMetadata(`data/cached/${region}/${id}/state.bin`);
      realms.push({
        id,
        region,
        lastUpdated: meta?.lastModified ? meta.lastModified.toISOString() : null,
      });
    }

    realms.sort((a, b) => a.id - b.id);

    return NextResponse.json({ region, realms });
  } catch (err: unknown) {
    return new NextResponse(
      `Failed to list realms: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 }
    );
  }
}