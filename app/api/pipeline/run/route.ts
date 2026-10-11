import { type NextRequest, NextResponse } from 'next/server';
import { BlizzardService } from '@/src/services/blizzard';
import { R2Service } from '@/src/services/r2';
import { AuctionAggregator } from '@/src/services/aggregator';
import {
  badRequest,
  enforceRateLimit,
  parseRealmId,
  upstreamError,
  DEFAULT_REALM_ID,
} from '@/src/utils/apiGuard';

/**
 * Full ingestion pipeline: fetch a Battle.net snapshot, aggregate it, encode to
 * .bin and persist to R2.
 *
 * This is the most expensive endpoint in the app — one call can pull hundreds of
 * thousands of auctions and write to storage — and it was open, unauthenticated
 * and unthrottled. It is now rate limited per client IP.
 *
 * A per-IP limit is a floor, not a ceiling: `x-forwarded-for` is client
 * controlled. For a hard guarantee, put this behind Cloud Run IAM (or an
 * authenticated proxy) and treat the limiter as defence in depth.
 */

/** One full run per 5 s, burst of 5. A human clicking "Run pipeline" is fine. */
const LIMIT = 5;
const WINDOW_MS = 5_000;

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'pipeline-run', LIMIT, WINDOW_MS);
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      connectedRealmId?: unknown;
    };

    const raw = body.connectedRealmId;
    let connectedRealmId = DEFAULT_REALM_ID;

    if (raw !== undefined && raw !== null) {
      // Narrow before stringifying: the body is untrusted JSON, so `String(raw)`
      // on an object would produce "[object Object]" and sail past a naive
      // numeric check.
      if (typeof raw !== 'number' && typeof raw !== 'string') {
        return badRequest('connectedRealmId must be a positive integer');
      }
      const parsed = parseRealmId(String(raw));
      if (parsed === null) {
        return badRequest('connectedRealmId must be a positive integer');
      }
      connectedRealmId = parsed;
    }

    const blizzard = new BlizzardService();
    const r2 = new R2Service();

    // forceFetch: an explicit "Run pipeline" must actually reach Battle.net.
    // If-Modified-Since is reserved for the polling path, and a 304 here
    // would mean there is nothing to aggregate.
    const { snapshot, source, lastModified } = await blizzard.fetchAuctionSnapshot(
      connectedRealmId,
      true
    );
    const result = await AuctionAggregator.processSnapshot(connectedRealmId, snapshot, r2);

    return NextResponse.json({
      success: true,
      // Surfaced so the UI can say plainly whether it is showing live or
      // demo numbers. `synthetic_forever` only happens with no credentials.
      source,
      lastModified,
      result: {
        ...result,
        source: r2.hasCloudflareR2() ? 'Cloudflare R2 Bucket' : 'Fast Local/Memory Cache',
      },
    });
  } catch (err: unknown) {
    return upstreamError(err, 'pipeline/run');
  }
}
