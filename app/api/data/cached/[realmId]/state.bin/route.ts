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
import { isCacheEntryPreCreds } from '@/src/utils/cacheStaleness';

/**
 * HMR-safe registry of the moment Blizzard credentials were first observed
 * per realm. Stored on `globalThis` so Next.js dev hot reloads do not wipe
 * the marker; this is the only way to detect "cache was filled by the
 * synthetic snapshot while creds were absent, then creds were added".
 */
const credsFirstSeenRegistry = (globalThis as {
  __wowForeverCredsFirstSeen?: Map<number, number>;
}).__wowForeverCredsFirstSeen ??= new Map<number, number>();

/** Stamp the moment creds are first observed for this realm and return it. */
function noteCredsFirstSeen(realmId: number): number {
  const existing = credsFirstSeenRegistry.get(realmId);
  if (existing !== undefined) return existing;
  const now = Date.now();
  credsFirstSeenRegistry.set(realmId, now);
  return now;
}

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
    const blizzard = new BlizzardService();

    // Drop a cache entry that pre-dates the moment Blizzard credentials were
    // first seen in this process. Without this branch, a session that booted
    // with no creds caches the synthetic snapshot, then silently keeps
    // serving it after `.env.local` is updated to add live OAuth creds.
    if (buffer && blizzard.hasCredentials()) {
      const meta = R2Service.getCacheMeta(stateKey);
      const credsFirstSeenAt = noteCredsFirstSeen(connectedRealmId);
      if (meta && isCacheEntryPreCreds(meta, credsFirstSeenAt)) {
        R2Service.deleteMemoryCache(stateKey);
        buffer = null;
      }
    }

    // If not cached yet, bootstrap snapshot immediately. A cache miss means
    // we have nothing to serve, so this must be a real fetch; a 304 would
    // leave the route with no data and no explanation.
    if (!buffer) {
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
