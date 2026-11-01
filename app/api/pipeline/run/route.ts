import { type NextRequest, NextResponse } from 'next/server';
import { BlizzardService } from '@/src/services/blizzard';
import { R2Service } from '@/src/services/r2';
import { AuctionAggregator } from '@/src/services/aggregator';
import { recordRealmName } from '@/src/services/realmNames';
import { warmMetadataForIds } from '@/src/services/itemMetadataCache';
import {
  badRequest,
  enforceRateLimit,
  parseRealmId,
  requireBearer,
  upstreamError,
  DEFAULT_REALM_ID,
} from '@/src/utils/apiGuard';

/**
 * Full ingestion pipeline: fetch a Battle.net snapshot, aggregate it, encode to
 * .bin and persist to R2.
 *
 * This is the most expensive endpoint in the app — one call can pull hundreds
 * of thousands of auctions and write to storage. It is therefore:
 *
 *  1. Bearer-gated by `requireBearer`, which compares the `Authorization`
 *     header against `PIPELINE_RUN_TOKEN` using `crypto.timingSafeEqual`.
 *     Production refuses the request (500) if the env var is unset so the
 *     route can never silently fall open.
 *  2. Rate-limited per client IP as defence in depth. The per-IP limit is a
 *     floor, not a ceiling: `x-forwarded-for` is client controlled. With the
 *     bearer guard in place, the limiter only ever sees authenticated
 *     traffic, so its job is to bound an operator's own accidental loops
 *     rather than to stop abuse.
 *
 * Trigger from outside the browser:
 *
 *   curl -X POST "$APP_URL/api/pipeline/run" \
 *     -H "Authorization: Bearer $PIPELINE_RUN_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{"connectedRealmId": 4401}'
 */

/** One full run per 5 s, burst of 5. A human clicking "Run pipeline" is fine. */
const LIMIT = 5;
const WINDOW_MS = 5_000;

/**
 * Cap the items warmed inline at the end of every successful run. The
 * cache is shared (in-memory) across realms and survives across runs, so
 * the first run for a realm pays the full cost and every subsequent run
 * is essentially free. ~100 items × concurrency 5 ≈ 3 s extra on a cold
 * cache, which keeps the manual "Run pipeline" button snappy and stays
 * inside the Vercel Hobby 120 s budget.
 */
const WARM_CAP = 100;

export async function POST(req: NextRequest) {
  const unauthorized = requireBearer(req);
  if (unauthorized) return unauthorized;

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
    const product: 'retail' | 'forever' =
      process.env.BLIZZARD_PRODUCT === 'forever' ? 'forever' : 'retail';
    const region = blizzard.getRegion() as 'eu' | 'us';
    const result = await AuctionAggregator.processSnapshot(
      product,
      region,
      connectedRealmId,
      snapshot,
      r2
    );

    // Resolve the realm's display name once, on the authenticated path,
    // so the public listing route can show real names without ever
    // calling Battle.net itself.
    try {
      await recordRealmName({
        r2,
        blizzard,
        product,
        region,
        connectedRealmId,
      });
    } catch (err) {
      console.error(
        `[API] pipeline/run: could not record the name of realm ${connectedRealmId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    // Inline metadata warming so the cron-driven cache stays warm without
    // needing a separate bearer call. Best-effort: a Blizzard outage on
    // this step must not break the pipeline response, which already
    // delivered the far more valuable state.bin to R2.
    //
    // The public `GET /api/items-meta` route is cache-only — see that
    // file's header for the auth split that made this necessary.
    let warm: Awaited<ReturnType<typeof warmMetadataForIds>> | null = null;
    let warmIds: number[] = [];
    if (blizzard.hasCredentials() && result.topItemIds.length > 0) {
      warmIds = result.topItemIds.slice(0, WARM_CAP);
      try {
        warm = await warmMetadataForIds(
          (id) => blizzard.fetchItemMetadata(id),
          warmIds
        );
      } catch (err) {
        console.error(
          `[API] pipeline/run: inline metadata warm failed for realm ${connectedRealmId}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    return NextResponse.json({
      success: true,
      // Surfaced so the UI can say plainly whether it is showing live or
      // demo numbers. `synthetic_forever` only happens with no credentials.
      source,
      lastModified,
      result: {
        connectedRealmId: result.connectedRealmId,
        generatedAt: result.generatedAt,
        totalAuctions: result.totalAuctions,
        uniqueItemCount: result.uniqueItemCount,
        stateBinSize: result.stateBinSize,
        itemBinCount: result.itemBinCount,
        totalItemBinSize: result.totalItemBinSize,
        rawJsonEquivalentSize: result.rawJsonEquivalentSize,
        compressionRatioPercent: result.compressionRatioPercent,
        processingTimeMs: result.processingTimeMs,
        historyBytes: result.historyBytes,
        // How many items have a measured 24 h delta. The rest are waiting
        // for a second observation a day apart.
        itemsWithDelta: result.itemsWithDelta,
        source: r2.hasCloudflareR2() ? 'Cloudflare R2 Bucket' : 'Fast Local/Memory Cache',
      },
      // Informational — `{ warmedIds, fetched, skipped, failed, retriedOut }`
      // when warming ran; null when it didn't (no creds / empty snapshot).
      warm: warm
        ? { warmedIds: warmIds.length, ...warm }
        : null,
    });
  } catch (err: unknown) {
    return upstreamError(err, 'pipeline/run');
  }
}
